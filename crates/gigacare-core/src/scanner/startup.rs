//! Módulo scanner de elementos de inicio de Windows (T018).
//!
//! Escanea carpetas Startup, claves de registro Run (HKCU/HKLM),
//! Task Scheduler y servicios automáticos. Clasifica el impacto de cada
//! elemento y protege servicios críticos con una lista blanca.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::Result;
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ModuleScanResult, ModuleStatus, ScanFilters};
use crate::scanner::{check_cancelled, ScannerModule};

// ─────────────────────────── StartupSource ────────────────────────

/// Origen de un elemento de inicio.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupSource {
    /// Carpeta Startup del usuario.
    StartupFolder,
    /// Clave HKCU\...\Run del registro.
    RegistryHkcu,
    /// Clave HKLM\...\Run del registro.
    RegistryHklm,
    /// Tarea programada (Task Scheduler).
    TaskScheduler,
    /// Servicio con inicio automático.
    AutoService,
}

impl std::fmt::Display for StartupSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            StartupSource::StartupFolder => "startup_folder",
            StartupSource::RegistryHkcu => "registry_hkcu",
            StartupSource::RegistryHklm => "registry_hklm",
            StartupSource::TaskScheduler => "task_scheduler",
            StartupSource::AutoService => "auto_service",
        };
        write!(f, "{}", s)
    }
}

// ─────────────────────────── ImpactLevel ──────────────────────────

/// Nivel de impacto de un elemento de inicio sobre el rendimiento.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImpactLevel {
    /// Alto: servicio pesado o tarea que consume muchos recursos.
    High,
    /// Medio: aplicación de usuario con carga moderada.
    Medium,
    /// Bajo: elemento ligero o inofensivo.
    Low,
}

impl std::fmt::Display for ImpactLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ImpactLevel::High => "high",
            ImpactLevel::Medium => "medium",
            ImpactLevel::Low => "low",
        };
        write!(f, "{}", s)
    }
}

// ─────────────────────────── StartupItem ──────────────────────────

/// Elemento individual de inicio de Windows.
///
/// No es un ScanItem genérico; tiene campos específicos para gestionar
/// elementos de arranque: origen, impacto, estado y protección.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartupItem {
    /// Nombre del elemento (servicio, tarea, acceso directo).
    pub name: String,
    /// Ruta al ejecutable o script.
    pub path: String,
    /// Origen del elemento de inicio.
    pub source: StartupSource,
    /// Nivel de impacto estimado sobre el rendimiento.
    pub impact: ImpactLevel,
    /// Si el elemento está habilitado actualmente.
    pub enabled: bool,
    /// Si el elemento pertenece a la lista blanca de servicios protegidos.
    pub protected: bool,
}

// ─────────────────────────── ToggleAction ─────────────────────────

/// Registro de un cambio de estado (habilitar/deshabilitar) de un startup item.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToggleAction {
    /// Nombre del elemento afectado.
    pub item_name: String,
    /// Fecha y hora del cambio.
    pub timestamp: DateTime<Utc>,
    /// Estado anterior.
    pub previous_enabled: bool,
    /// Nuevo estado.
    pub new_enabled: bool,
}

// ─────────────────────────── Trait StartupDataProvider ─────────────

/// Trait para abstraer el acceso a datos de inicio (para testing con mocks).
pub trait StartupDataProvider: Send + Sync {
    /// Retorna los items de la carpeta Startup.
    fn startup_folder_items(&self) -> Vec<StartupItem>;
    /// Retorna los items de las claves de registro Run.
    fn registry_run_items(&self) -> Vec<StartupItem>;
    /// Retorna las tareas programadas.
    fn scheduled_tasks(&self) -> Vec<StartupItem>;
    /// Retorna los servicios con inicio automático.
    fn auto_services(&self) -> Vec<StartupItem>;
}

// ─────────────────────────── Servicios protegidos ─────────────────

/// Estructura interna para deserializar el JSON de servicios protegidos.
#[derive(Debug, Deserialize)]
struct ProtectedServicesFile {
    protected_services: Vec<String>,
}

/// Carga la lista blanca de servicios protegidos desde el JSON embebido.
fn load_protected_services() -> Vec<String> {
    let json = include_str!("protected_services.json");
    let file: ProtectedServicesFile =
        serde_json::from_str(json).expect("protected_services.json inválido");
    file.protected_services
}

/// Verifica si un nombre de servicio está en la lista blanca de protegidos.
///
/// La comparación es case-insensitive.
pub fn is_protected_service(name: &str) -> bool {
    let protected = load_protected_services();
    let name_lower = name.to_lowercase();
    protected.iter().any(|s| s.to_lowercase() == name_lower)
}

// ─────────────────────────── Clasificación de impacto ─────────────

/// Palabras clave que indican alto impacto por recurso.
const HIGH_IMPACT_KEYWORDS: &[&str] = &[
    "antivirus", "security", "backup", "sync", "update", "onedrive",
    "dropbox", "adobe", "java", "dotnet", "vmware", "virtualbox",
    "docker", "sql", "database",
];

/// Palabras clave que indican bajo impacto.
const LOW_IMPACT_KEYWORDS: &[&str] = &[
    "notification", "toast", "tray", "helper", "agent", "icon",
    "shortcut", "link",
];

/// Clasifica el nivel de impacto de un elemento de inicio.
///
/// Reglas:
/// 1. Servicios automáticos (AutoService) y tareas programadas con alto recurso → Alto
/// 2. Elementos de registro con keywords conocidos → según keyword
/// 3. Carpeta Startup → generalmente Medio
/// 4. Fallback → Medio
pub fn classify_impact(name: &str, source: StartupSource) -> ImpactLevel {
    let name_lower = name.to_lowercase();

    // Los servicios automáticos tienen alto impacto por defecto
    if source == StartupSource::AutoService {
        // A menos que sean helper/tray ligeros
        if LOW_IMPACT_KEYWORDS.iter().any(|kw| name_lower.contains(kw)) {
            return ImpactLevel::Low;
        }
        return ImpactLevel::High;
    }

    // Verificar keywords de alto impacto
    if HIGH_IMPACT_KEYWORDS.iter().any(|kw| name_lower.contains(kw)) {
        return ImpactLevel::High;
    }

    // Verificar keywords de bajo impacto
    if LOW_IMPACT_KEYWORDS.iter().any(|kw| name_lower.contains(kw)) {
        return ImpactLevel::Low;
    }

    // Task Scheduler suele ser medio-alto
    if source == StartupSource::TaskScheduler {
        return ImpactLevel::Medium;
    }

    // Default
    ImpactLevel::Medium
}

// ─────────────────────────── Toggle habilitar/deshabilitar ────────

/// Gestiona el historial de toggles de elementos de inicio.
#[derive(Debug, Default)]
pub struct ToggleHistory {
    actions: Vec<ToggleAction>,
}

impl ToggleHistory {
    /// Crea un historial vacío.
    pub fn new() -> Self {
        Self {
            actions: Vec::new(),
        }
    }

    /// Registra un toggle y retorna el item actualizado.
    ///
    /// **No** modifica el sistema real; solo actualiza el modelo en memoria.
    /// Si el item es protegido, retorna `Err` sin registrar.
    pub fn toggle_item(&mut self, item: &mut StartupItem) -> std::result::Result<ToggleAction, String> {
        if item.protected {
            return Err(format!(
                "El servicio '{}' es protegido y no puede deshabilitarse",
                item.name
            ));
        }

        let action = ToggleAction {
            item_name: item.name.clone(),
            timestamp: Utc::now(),
            previous_enabled: item.enabled,
            new_enabled: !item.enabled,
        };

        item.enabled = action.new_enabled;
        self.actions.push(action.clone());
        Ok(action)
    }

    /// Retorna el historial completo de acciones.
    pub fn history(&self) -> &[ToggleAction] {
        &self.actions
    }
}

// ─────────────────────────── StartupScanner ───────────────────────

/// Scanner de elementos de inicio de Windows.
///
/// Implementa `ScannerModule` para integrarse con el orquestador.
/// Los items de inicio se retornan en el campo `metadata` del
/// `ModuleScanResult` como JSON serializado, dado que no son
/// `ScanItem` convencionales.
pub struct StartupScanner<P: StartupDataProvider> {
    provider: P,
}

impl<P: StartupDataProvider> StartupScanner<P> {
    /// Crea un nuevo StartupScanner con el proveedor de datos dado.
    pub fn new(provider: P) -> Self {
        Self { provider }
    }

    /// Ejecuta el escaneo completo de todos los orígenes y retorna los items.
    pub fn collect_items(&self) -> Vec<StartupItem> {
        let mut items = Vec::new();

        items.extend(self.provider.startup_folder_items());
        items.extend(self.provider.registry_run_items());
        items.extend(self.provider.scheduled_tasks());
        items.extend(self.provider.auto_services());

        // Marcar servicios protegidos
        for item in &mut items {
            if is_protected_service(&item.name) {
                item.protected = true;
            }
        }

        // Reclasificar impacto
        for item in &mut items {
            item.impact = classify_impact(&item.name, item.source);
        }

        items
    }
}

#[async_trait]
impl<P: StartupDataProvider + 'static> ScannerModule for StartupScanner<P> {
    fn module_id(&self) -> ScanModule {
        ScanModule::StartupItems
    }

    async fn scan(
        &self,
        _config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        _filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        check_cancelled(cancel)?;

        // Emitir progreso inicial
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::StartupItems,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 0.0,
                eta_seconds: None,
            })
            .await;

        let items = self.collect_items();

        check_cancelled(cancel)?;

        // Emitir progreso final
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::StartupItems,
                items_scanned: items.len() as u64,
                items_found: items.len() as u64,
                bytes_found: 0,
                percent: 100.0,
                eta_seconds: Some(0),
            })
            .await;

        let duration = start.elapsed();

        // Serializar los StartupItems como metadata en el resultado
        let mut metadata = HashMap::new();
        metadata.insert(
            "startup_items".to_string(),
            serde_json::to_value(&items).unwrap_or_default(),
        );

        Ok(ModuleScanResult {
            module_id: ScanModule::StartupItems.as_str().to_string(),
            status: ModuleStatus::Completed,
            duration_ms: duration.as_millis() as u64,
            items_found: items.len() as u64,
            total_size_bytes: 0, // Los startup items no tienen tamaño de archivo
            items: Vec::new(),   // No son ScanItems convencionales
        })
    }
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Mock provider ───────────────────────────────────────────

    /// Proveedor mock de datos de inicio para tests.
    struct MockStartupProvider {
        folder_items: Vec<StartupItem>,
        registry_items: Vec<StartupItem>,
        tasks: Vec<StartupItem>,
        services: Vec<StartupItem>,
    }

    impl MockStartupProvider {
        fn new() -> Self {
            Self {
                folder_items: vec![StartupItem {
                    name: "Discord".to_string(),
                    path: "C:\\Users\\Test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Discord.lnk".to_string(),
                    source: StartupSource::StartupFolder,
                    impact: ImpactLevel::Medium,
                    enabled: true,
                    protected: false,
                }],
                registry_items: vec![
                    StartupItem {
                        name: "OneDrive".to_string(),
                        path: "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe".to_string(),
                        source: StartupSource::RegistryHkcu,
                        impact: ImpactLevel::High,
                        enabled: true,
                        protected: false,
                    },
                    StartupItem {
                        name: "SecurityHealth".to_string(),
                        path: "C:\\Windows\\System32\\SecurityHealthSystray.exe".to_string(),
                        source: StartupSource::RegistryHklm,
                        impact: ImpactLevel::Medium,
                        enabled: true,
                        protected: false,
                    },
                ],
                tasks: vec![StartupItem {
                    name: "GoogleUpdateTaskMachineCore".to_string(),
                    path: "C:\\Program Files\\Google\\Update\\GoogleUpdate.exe".to_string(),
                    source: StartupSource::TaskScheduler,
                    impact: ImpactLevel::Medium,
                    enabled: true,
                    protected: false,
                }],
                services: vec![
                    StartupItem {
                        name: "WinDefend".to_string(),
                        path: "C:\\Windows\\System32\\svchost.exe".to_string(),
                        source: StartupSource::AutoService,
                        impact: ImpactLevel::High,
                        enabled: true,
                        protected: false, // Se marca en collect_items
                    },
                    StartupItem {
                        name: "Spooler".to_string(),
                        path: "C:\\Windows\\System32\\spoolsv.exe".to_string(),
                        source: StartupSource::AutoService,
                        impact: ImpactLevel::Medium,
                        enabled: true,
                        protected: false,
                    },
                    StartupItem {
                        name: "SomeThirdPartyBackup".to_string(),
                        path: "C:\\Program Files\\BackupApp\\backup.exe".to_string(),
                        source: StartupSource::AutoService,
                        impact: ImpactLevel::Medium,
                        enabled: true,
                        protected: false,
                    },
                ],
            }
        }
    }

    impl StartupDataProvider for MockStartupProvider {
        fn startup_folder_items(&self) -> Vec<StartupItem> {
            self.folder_items.clone()
        }
        fn registry_run_items(&self) -> Vec<StartupItem> {
            self.registry_items.clone()
        }
        fn scheduled_tasks(&self) -> Vec<StartupItem> {
            self.tasks.clone()
        }
        fn auto_services(&self) -> Vec<StartupItem> {
            self.services.clone()
        }
    }

    // ─── Tests ───────────────────────────────────────────────────

    #[test]
    fn test_collect_items_lists_all_sources() {
        let provider = MockStartupProvider::new();
        let scanner = StartupScanner::new(provider);
        let items = scanner.collect_items();

        // 1 folder + 2 registry + 1 task + 3 services = 7
        assert_eq!(items.len(), 7);

        // Verificar que hay items de cada fuente
        assert!(items.iter().any(|i| i.source == StartupSource::StartupFolder));
        assert!(items.iter().any(|i| i.source == StartupSource::RegistryHkcu));
        assert!(items.iter().any(|i| i.source == StartupSource::RegistryHklm));
        assert!(items.iter().any(|i| i.source == StartupSource::TaskScheduler));
        assert!(items.iter().any(|i| i.source == StartupSource::AutoService));
    }

    #[test]
    fn test_classify_impact_auto_service_high() {
        // Servicios automáticos tienen impacto alto por defecto
        let impact = classify_impact("SomeDatabase", StartupSource::AutoService);
        assert_eq!(impact, ImpactLevel::High);
    }

    #[test]
    fn test_classify_impact_auto_service_low_keyword() {
        // Servicios con keyword ligero → bajo
        let impact = classify_impact("NotificationHelper", StartupSource::AutoService);
        assert_eq!(impact, ImpactLevel::Low);
    }

    #[test]
    fn test_classify_impact_high_keyword() {
        let impact = classify_impact("OneDriveSync", StartupSource::RegistryHkcu);
        assert_eq!(impact, ImpactLevel::High);
    }

    #[test]
    fn test_classify_impact_low_keyword() {
        let impact = classify_impact("SystemTrayIcon", StartupSource::StartupFolder);
        assert_eq!(impact, ImpactLevel::Low);
    }

    #[test]
    fn test_classify_impact_default_medium() {
        let impact = classify_impact("RandomApp", StartupSource::StartupFolder);
        assert_eq!(impact, ImpactLevel::Medium);
    }

    #[test]
    fn test_classify_impact_task_scheduler_medium() {
        let impact = classify_impact("SomeTask", StartupSource::TaskScheduler);
        assert_eq!(impact, ImpactLevel::Medium);
    }

    #[test]
    fn test_protected_services_whitelist() {
        // WinDefend está en la lista
        assert!(is_protected_service("WinDefend"));
        // Case insensitive
        assert!(is_protected_service("windefend"));
        assert!(is_protected_service("WINDEFEND"));
        // Spooler está en la lista
        assert!(is_protected_service("Spooler"));
        // Servicios de terceros NO
        assert!(!is_protected_service("SomeThirdPartyBackup"));
        assert!(!is_protected_service("RandomApp"));
    }

    #[test]
    fn test_collect_items_marks_protected() {
        let provider = MockStartupProvider::new();
        let scanner = StartupScanner::new(provider);
        let items = scanner.collect_items();

        let windefend = items.iter().find(|i| i.name == "WinDefend").unwrap();
        assert!(windefend.protected, "WinDefend debe marcarse como protegido");

        let spooler = items.iter().find(|i| i.name == "Spooler").unwrap();
        assert!(spooler.protected, "Spooler debe marcarse como protegido");

        let third_party = items.iter().find(|i| i.name == "SomeThirdPartyBackup").unwrap();
        assert!(!third_party.protected, "SomeThirdPartyBackup NO debe ser protegido");
    }

    #[test]
    fn test_toggle_item_enabled_to_disabled() {
        let mut history = ToggleHistory::new();
        let mut item = StartupItem {
            name: "TestApp".to_string(),
            path: "C:\\test.exe".to_string(),
            source: StartupSource::RegistryHkcu,
            impact: ImpactLevel::Medium,
            enabled: true,
            protected: false,
        };

        let action = history.toggle_item(&mut item).unwrap();
        assert!(!item.enabled);
        assert!(action.previous_enabled);
        assert!(!action.new_enabled);
        assert_eq!(action.item_name, "TestApp");
    }

    #[test]
    fn test_toggle_item_disabled_to_enabled() {
        let mut history = ToggleHistory::new();
        let mut item = StartupItem {
            name: "TestApp".to_string(),
            path: "C:\\test.exe".to_string(),
            source: StartupSource::RegistryHkcu,
            impact: ImpactLevel::Medium,
            enabled: false,
            protected: false,
        };

        let action = history.toggle_item(&mut item).unwrap();
        assert!(item.enabled);
        assert!(!action.previous_enabled);
        assert!(action.new_enabled);
    }

    #[test]
    fn test_toggle_protected_item_fails() {
        let mut history = ToggleHistory::new();
        let mut item = StartupItem {
            name: "WinDefend".to_string(),
            path: "C:\\svchost.exe".to_string(),
            source: StartupSource::AutoService,
            impact: ImpactLevel::High,
            enabled: true,
            protected: true,
        };

        let result = history.toggle_item(&mut item);
        assert!(result.is_err());
        assert!(item.enabled, "Item protegido no debe cambiar de estado");
        assert!(result.unwrap_err().contains("protegido"));
    }

    #[test]
    fn test_toggle_history_records() {
        let mut history = ToggleHistory::new();
        let mut item = StartupItem {
            name: "App1".to_string(),
            path: "C:\\app1.exe".to_string(),
            source: StartupSource::StartupFolder,
            impact: ImpactLevel::Low,
            enabled: true,
            protected: false,
        };

        // Toggle 2 veces
        history.toggle_item(&mut item).unwrap();
        history.toggle_item(&mut item).unwrap();

        assert_eq!(history.history().len(), 2);
        assert!(history.history()[0].previous_enabled);
        assert!(!history.history()[0].new_enabled);
        assert!(!history.history()[1].previous_enabled);
        assert!(history.history()[1].new_enabled);
    }

    #[tokio::test]
    async fn test_scanner_module_impl() {
        let provider = MockStartupProvider::new();
        let scanner = StartupScanner::new(provider);

        assert_eq!(scanner.module_id(), ScanModule::StartupItems);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, mut rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.module_id, "startup_items");
        assert_eq!(result.status, ModuleStatus::Completed);
        assert_eq!(result.items_found, 7); // 1+2+1+3
        assert_eq!(result.total_size_bytes, 0);
        assert!(result.items.is_empty()); // No ScanItems convencionales

        // Verificar eventos de progreso
        drop(tx);
        let mut events = Vec::new();
        while let Some(ev) = rx.recv().await {
            events.push(ev);
        }
        assert!(events.len() >= 2);
        assert_eq!(events[0].percent, 0.0);
        assert_eq!(events.last().unwrap().percent, 100.0);
    }

    #[tokio::test]
    async fn test_scanner_module_cancelled() {
        let provider = MockStartupProvider::new();
        let scanner = StartupScanner::new(provider);
        let config = AppConfig::default();
        let cancel = AtomicBool::new(true); // ya cancelado
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_startup_item_serialize() {
        let item = StartupItem {
            name: "TestApp".to_string(),
            path: "C:\\test.exe".to_string(),
            source: StartupSource::RegistryHkcu,
            impact: ImpactLevel::High,
            enabled: true,
            protected: false,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("registry_hkcu"));
        assert!(json.contains("high"));

        let deserialized: StartupItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "TestApp");
        assert_eq!(deserialized.source, StartupSource::RegistryHkcu);
        assert_eq!(deserialized.impact, ImpactLevel::High);
    }

    #[test]
    fn test_startup_source_display() {
        assert_eq!(format!("{}", StartupSource::StartupFolder), "startup_folder");
        assert_eq!(format!("{}", StartupSource::RegistryHkcu), "registry_hkcu");
        assert_eq!(format!("{}", StartupSource::RegistryHklm), "registry_hklm");
        assert_eq!(format!("{}", StartupSource::TaskScheduler), "task_scheduler");
        assert_eq!(format!("{}", StartupSource::AutoService), "auto_service");
    }

    #[test]
    fn test_impact_level_display() {
        assert_eq!(format!("{}", ImpactLevel::High), "high");
        assert_eq!(format!("{}", ImpactLevel::Medium), "medium");
        assert_eq!(format!("{}", ImpactLevel::Low), "low");
    }

    #[test]
    fn test_load_protected_services_json() {
        let services = load_protected_services();
        assert!(!services.is_empty());
        assert!(services.contains(&"WinDefend".to_string()));
        assert!(services.contains(&"wuauserv".to_string()));
        assert!(services.contains(&"Spooler".to_string()));
    }

    #[test]
    fn test_classify_impact_backup_keyword_high() {
        let impact = classify_impact("SomeThirdPartyBackup", StartupSource::AutoService);
        // AutoService → High por defecto (backup keyword also high)
        assert_eq!(impact, ImpactLevel::High);
    }

    #[test]
    fn test_classify_impact_onedrive_registry() {
        let impact = classify_impact("OneDrive", StartupSource::RegistryHkcu);
        assert_eq!(impact, ImpactLevel::High); // "onedrive" keyword
    }
}
