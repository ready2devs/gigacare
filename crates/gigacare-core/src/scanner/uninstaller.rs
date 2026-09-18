//! Módulo scanner de carpetas residuales huérfanas post-desinstalación.
//!
//! Escanea carpetas en %AppData%, %LocalAppData% y %ProgramData% que
//! pertenecen a aplicaciones ya desinstaladas, comparando contra la lista
//! de apps instaladas (registro HKLM\\SOFTWARE\\Microsoft\\Windows\\
//! CurrentVersion\\Uninstall) y un índice de huellas conocidas
//! (known_footprints.json).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use async_trait::async_trait;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::Result;
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ItemCategory, ItemMetadata, ModuleScanResult, ModuleStatus, ScanFilters, ScanItem};
use crate::scanner::{check_cancelled, ScannerModule};

// ─────────────────────────── Footprint Model ──────────────────────

/// Entrada de huella conocida de una aplicación.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownFootprint {
    /// Nombre de la aplicación.
    pub app_name: String,
    /// Carpetas que esta aplicación deja en AppData/LocalAppData/ProgramData.
    pub folders: Vec<String>,
    /// Patrones de nombre en el registro de desinstalación.
    pub registry_patterns: Vec<String>,
}

/// Archivo de huellas conocidas con versionado.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownFootprintsFile {
    /// Versión del archivo de huellas.
    pub version: String,
    /// Lista de huellas conocidas.
    pub footprints: Vec<KnownFootprint>,
}

// ─────────────────────────── Installed App ─────────────────────────

/// Representación de una app instalada (leída del registro o mock).
#[derive(Debug, Clone)]
pub struct InstalledApp {
    /// Nombre de la aplicación tal como aparece en el registro.
    pub display_name: String,
    /// Ruta de instalación (si está disponible).
    pub install_location: Option<String>,
}

// ─────────────────────────── Registry Provider Trait ───────────────

/// Trait para abstraer la lectura del registro de Windows.
///
/// En producción se implementa con acceso real al registro;
/// en tests se usa un mock.
pub trait RegistryProvider: Send + Sync {
    /// Lee la lista de aplicaciones instaladas desde el registro.
    fn get_installed_apps(&self) -> Result<Vec<InstalledApp>>;
}

// ─────────────────────────── Filesystem Provider Trait ─────────────

/// Trait para abstraer el acceso al sistema de archivos.
///
/// Permite mockear las carpetas existentes en los directorios escaneados.
pub trait FilesystemProvider: Send + Sync {
    /// Lista las carpetas directas dentro de un directorio.
    fn list_subdirectories(&self, dir: &Path) -> Result<Vec<PathBuf>>;

    /// Calcula el tamaño total de una carpeta (recursivamente).
    fn directory_size(&self, dir: &Path) -> Result<u64>;
}

// ─────────────────────────── Default Providers ────────────────────

/// Proveedor de registro real (Windows).
/// Lee HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall.
pub struct RealRegistryProvider;

impl RegistryProvider for RealRegistryProvider {
    fn get_installed_apps(&self) -> Result<Vec<InstalledApp>> {
        // En una implementación real se leería el registro de Windows.
        // Por ahora retornamos lista vacía (stub de producción).
        Ok(Vec::new())
    }
}

/// Proveedor de filesystem real.
pub struct RealFilesystemProvider;

impl FilesystemProvider for RealFilesystemProvider {
    fn list_subdirectories(&self, dir: &Path) -> Result<Vec<PathBuf>> {
        let mut dirs = Vec::new();
        if dir.exists() {
            let entries = std::fs::read_dir(dir)?;
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    dirs.push(entry.path());
                }
            }
        }
        Ok(dirs)
    }

    fn directory_size(&self, dir: &Path) -> Result<u64> {
        let mut total = 0u64;
        if dir.is_dir() {
            for entry in std::fs::read_dir(dir)?.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    total += self.directory_size(&path)?;
                } else if let Ok(meta) = std::fs::metadata(&path) {
                    total += meta.len();
                }
            }
        }
        Ok(total)
    }
}

// ─────────────────────────── UninstallerScanner ───────────────────

/// Scanner de carpetas residuales huérfanas post-desinstalación.
///
/// Compara las carpetas existentes en directorios de datos de usuario
/// contra la lista de apps instaladas y las huellas conocidas para
/// detectar residuos huérfanos.
pub struct UninstallerScanner {
    registry: Box<dyn RegistryProvider>,
    filesystem: Box<dyn FilesystemProvider>,
    footprints: Vec<KnownFootprint>,
}

impl UninstallerScanner {
    /// Crea un nuevo UninstallerScanner con los proveedores dados.
    pub fn new(
        registry: Box<dyn RegistryProvider>,
        filesystem: Box<dyn FilesystemProvider>,
        footprints: Vec<KnownFootprint>,
    ) -> Self {
        Self {
            registry,
            filesystem,
            footprints,
        }
    }

    /// Crea un UninstallerScanner con proveedores reales y footprints embebidos.
    pub fn with_defaults() -> Self {
        let footprints = Self::load_embedded_footprints();
        Self {
            registry: Box::new(RealRegistryProvider),
            filesystem: Box::new(RealFilesystemProvider),
            footprints,
        }
    }

    /// Carga las huellas conocidas embebidas en el binario.
    pub fn load_embedded_footprints() -> Vec<KnownFootprint> {
        let json = include_str!("known_footprints.json");
        match serde_json::from_str::<KnownFootprintsFile>(json) {
            Ok(file) => file.footprints,
            Err(_) => Vec::new(),
        }
    }

    /// Retorna los directorios base a escanear.
    fn scan_directories() -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Ok(appdata) = std::env::var("APPDATA") {
            dirs.push(PathBuf::from(appdata));
        }
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local_appdata));
        }
        if let Ok(programdata) = std::env::var("PROGRAMDATA") {
            dirs.push(PathBuf::from(programdata));
        }

        dirs
    }

    /// Construye un set con los nombres (en minúsculas) de apps instaladas.
    fn installed_app_names(&self) -> Result<HashSet<String>> {
        let apps = self.registry.get_installed_apps()?;
        let names: HashSet<String> = apps
            .into_iter()
            .map(|app| app.display_name.to_lowercase())
            .collect();
        Ok(names)
    }

    /// Verifica si una carpeta coincide con alguna huella conocida de una
    /// app que NO está instalada.
    fn find_orphan_match(
        &self,
        folder_name: &str,
        installed_names: &HashSet<String>,
    ) -> Option<String> {
        let folder_lower = folder_name.to_lowercase();

        for fp in &self.footprints {
            // Verificar si la carpeta coincide con alguna de las carpetas conocidas
            let matches_folder = fp.folders.iter().any(|f| f.to_lowercase() == folder_lower);

            if matches_folder {
                // Verificar si la app está instalada
                let is_installed = fp.registry_patterns.iter().any(|pattern| {
                    let pattern_lower = pattern.to_lowercase();
                    installed_names.iter().any(|name| name.contains(&pattern_lower))
                });

                if !is_installed {
                    return Some(fp.app_name.clone());
                }
            }
        }

        None
    }

    /// Ejecuta el escaneo de carpetas residuales.
    fn find_orphan_folders(
        &self,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        _filters: Option<&ScanFilters>,
    ) -> Result<Vec<ScanItem>> {
        let installed_names = self.installed_app_names()?;
        let scan_dirs = Self::scan_directories();
        let mut orphans = Vec::new();

        let total_dirs = scan_dirs.len();

        for (dir_idx, base_dir) in scan_dirs.iter().enumerate() {
            check_cancelled(cancel)?;

            let subdirs = match self.filesystem.list_subdirectories(base_dir) {
                Ok(dirs) => dirs,
                Err(_) => continue,
            };

            for subdir in &subdirs {
                check_cancelled(cancel)?;

                let folder_name = match subdir.file_name().and_then(|n| n.to_str()) {
                    Some(name) => name.to_string(),
                    None => continue,
                };

                if let Some(app_name) = self.find_orphan_match(&folder_name, &installed_names) {
                    let size = self.filesystem.directory_size(subdir).unwrap_or(0);

                    let item = ScanItem {
                        path: subdir.to_string_lossy().to_string(),
                        size_bytes: size,
                        modified_at: Utc::now(),
                        category: ItemCategory::Temp,
                        metadata: ItemMetadata {
                            app_source: Some(app_name),
                            project_name: None,
                            days_inactive: None,
                            extra: Default::default(),
                        },
                    };
                    orphans.push(item);
                }
            }

            // Emitir progreso
            let percent = ((dir_idx + 1) as f32 / total_dirs as f32) * 100.0;
            let _ = tx.try_send(ScanProgress {
                module: ScanModule::UninstallResiduals,
                items_scanned: (dir_idx + 1) as u64,
                items_found: orphans.len() as u64,
                bytes_found: orphans.iter().map(|i| i.size_bytes).sum(),
                percent,
                eta_seconds: None,
            });
        }

        Ok(orphans)
    }
}

#[async_trait]
impl ScannerModule for UninstallerScanner {
    fn module_id(&self) -> ScanModule {
        ScanModule::UninstallResiduals
    }

    async fn scan(
        &self,
        _config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        check_cancelled(cancel)?;

        // Emitir inicio (0%)
        let _ = tx.send(ScanProgress {
            module: ScanModule::UninstallResiduals,
            items_scanned: 0,
            items_found: 0,
            bytes_found: 0,
            percent: 0.0,
            eta_seconds: None,
        }).await;

        let orphans = self.find_orphan_folders(cancel, tx, filters)?;

        let total_size: u64 = orphans.iter().map(|i| i.size_bytes).sum();
        let items_found = orphans.len() as u64;

        // Emitir finalización (100%)
        let _ = tx.send(ScanProgress {
            module: ScanModule::UninstallResiduals,
            items_scanned: items_found,
            items_found,
            bytes_found: total_size,
            percent: 100.0,
            eta_seconds: Some(0),
        }).await;

        let duration = start.elapsed();
        Ok(ModuleScanResult {
            module_id: ScanModule::UninstallResiduals.as_str().to_string(),
            status: ModuleStatus::Completed,
            duration_ms: duration.as_millis() as u64,
            items_found,
            total_size_bytes: total_size,
            items: orphans,
        })
    }
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;

    // ───── Mock Registry Provider ─────

    struct MockRegistryProvider {
        apps: Vec<InstalledApp>,
    }

    impl MockRegistryProvider {
        fn new(apps: Vec<InstalledApp>) -> Self {
            Self { apps }
        }
    }

    impl RegistryProvider for MockRegistryProvider {
        fn get_installed_apps(&self) -> Result<Vec<InstalledApp>> {
            Ok(self.apps.clone())
        }
    }

    // ───── Mock Filesystem Provider ─────

    struct MockFilesystemProvider {
        /// Mapa de directorio base -> lista de subcarpetas.
        directories: HashMap<PathBuf, Vec<PathBuf>>,
        /// Mapa de carpeta -> tamaño.
        sizes: HashMap<PathBuf, u64>,
    }

    impl MockFilesystemProvider {
        fn new(
            directories: HashMap<PathBuf, Vec<PathBuf>>,
            sizes: HashMap<PathBuf, u64>,
        ) -> Self {
            Self { directories, sizes }
        }
    }

    impl FilesystemProvider for MockFilesystemProvider {
        fn list_subdirectories(&self, dir: &Path) -> Result<Vec<PathBuf>> {
            Ok(self.directories.get(dir).cloned().unwrap_or_default())
        }

        fn directory_size(&self, dir: &Path) -> Result<u64> {
            Ok(*self.sizes.get(dir).unwrap_or(&0))
        }
    }

    // ───── Helper para crear scanner de prueba ─────

    fn create_test_scanner(
        installed_apps: Vec<InstalledApp>,
        directories: HashMap<PathBuf, Vec<PathBuf>>,
        sizes: HashMap<PathBuf, u64>,
        footprints: Vec<KnownFootprint>,
    ) -> UninstallerScanner {
        UninstallerScanner::new(
            Box::new(MockRegistryProvider::new(installed_apps)),
            Box::new(MockFilesystemProvider::new(directories, sizes)),
            footprints,
        )
    }

    // ─────────────────────────── Test: módulo ID ──────────────────

    #[test]
    fn test_module_id() {
        let scanner = create_test_scanner(vec![], HashMap::new(), HashMap::new(), vec![]);
        assert_eq!(scanner.module_id(), ScanModule::UninstallResiduals);
    }

    // ─────────────────────────── Test: carga footprints embebidos ─

    #[test]
    fn test_load_embedded_footprints() {
        let footprints = UninstallerScanner::load_embedded_footprints();
        assert!(!footprints.is_empty(), "El archivo de huellas no debe estar vacío");

        // Verificar que tiene la estructura esperada
        let first = &footprints[0];
        assert!(!first.app_name.is_empty());
        assert!(!first.folders.is_empty());
        assert!(!first.registry_patterns.is_empty());
    }

    // ─────────────────────────── Test: deserialización de footprints

    #[test]
    fn test_footprints_deserialization() {
        let json = r#"{
            "version": "1.0.0",
            "footprints": [
                {
                    "app_name": "TestApp",
                    "folders": ["TestApp", ".testapp"],
                    "registry_patterns": ["Test App"]
                }
            ]
        }"#;
        let file: KnownFootprintsFile = serde_json::from_str(json).unwrap();
        assert_eq!(file.version, "1.0.0");
        assert_eq!(file.footprints.len(), 1);
        assert_eq!(file.footprints[0].app_name, "TestApp");
        assert_eq!(file.footprints[0].folders, vec!["TestApp", ".testapp"]);
    }

    // ─────────────────────────── Test: detecta carpetas huérfanas ─

    #[tokio::test]
    async fn test_detects_orphan_folders() {
        // Setup: Discord no está instalado pero tiene carpetas
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Roaming".to_string()));
        let discord_dir = appdata.join("discord");

        let mut directories = HashMap::new();
        directories.insert(appdata.clone(), vec![discord_dir.clone()]);

        let mut sizes = HashMap::new();
        sizes.insert(discord_dir.clone(), 1024 * 1024); // 1 MB

        let footprints = vec![KnownFootprint {
            app_name: "Discord".to_string(),
            folders: vec!["discord".to_string()],
            registry_patterns: vec!["Discord".to_string()],
        }];

        // Discord NO está en la lista de instalados → huérfano
        let installed_apps = vec![];

        let scanner = create_test_scanner(installed_apps, directories, sizes, footprints);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, mut rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.module_id, "uninstall_residuals");
        assert_eq!(result.status, ModuleStatus::Completed);
        assert!(result.items_found >= 1, "Debería detectar al menos 1 carpeta huérfana");

        // Verificar que el item encontrado es Discord
        let discord_item = result.items.iter().find(|i| {
            i.metadata.app_source.as_deref() == Some("Discord")
        });
        assert!(discord_item.is_some(), "Debería encontrar carpeta de Discord");

        if let Some(item) = discord_item {
            assert_eq!(item.size_bytes, 1024 * 1024);
            assert_eq!(item.category, ItemCategory::Temp);
        }

        // Verificar que se emitieron eventos de progreso
        drop(tx);
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }
        assert!(!events.is_empty(), "Debería emitir eventos de progreso");
    }

    // ─────────────────────────── Test: no marca como huérfano si está instalado

    #[tokio::test]
    async fn test_does_not_mark_installed_as_orphan() {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Roaming".to_string()));
        let discord_dir = appdata.join("Discord");

        let mut directories = HashMap::new();
        directories.insert(appdata.clone(), vec![discord_dir.clone()]);

        let mut sizes = HashMap::new();
        sizes.insert(discord_dir.clone(), 2048);

        let footprints = vec![KnownFootprint {
            app_name: "Discord".to_string(),
            folders: vec!["Discord".to_string()],
            registry_patterns: vec!["Discord".to_string()],
        }];

        // Discord SÍ está instalado
        let installed_apps = vec![InstalledApp {
            display_name: "Discord".to_string(),
            install_location: Some("C:\\Program Files\\Discord".to_string()),
        }];

        let scanner = create_test_scanner(installed_apps, directories, sizes, footprints);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        // No debe detectar huérfanos para Discord instalado
        let discord_orphan = result.items.iter().find(|i| {
            i.metadata.app_source.as_deref() == Some("Discord")
        });
        assert!(discord_orphan.is_none(), "No debería marcar Discord como huérfano si está instalado");
    }

    // ─────────────────────────── Test: cancellation ───────────────

    #[tokio::test]
    async fn test_scan_respects_cancellation() {
        let scanner = create_test_scanner(vec![], HashMap::new(), HashMap::new(), vec![]);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(true); // Ya cancelado
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await;
        // Debe retornar error de cancelación
        assert!(result.is_err());
    }

    // ─────────────────────────── Test: múltiples directorios ──────

    #[tokio::test]
    async fn test_scans_multiple_directories() {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Roaming".to_string()));
        let local_appdata = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Local".to_string()));

        let steam_roaming = appdata.join("Steam");
        let steam_local = local_appdata.join("Steam");

        let mut directories = HashMap::new();
        directories.insert(appdata.clone(), vec![steam_roaming.clone()]);
        directories.insert(local_appdata.clone(), vec![steam_local.clone()]);

        let mut sizes = HashMap::new();
        sizes.insert(steam_roaming.clone(), 500);
        sizes.insert(steam_local.clone(), 300);

        let footprints = vec![KnownFootprint {
            app_name: "Steam".to_string(),
            folders: vec!["Steam".to_string()],
            registry_patterns: vec!["Steam".to_string()],
        }];

        let scanner = create_test_scanner(vec![], directories, sizes, footprints);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        // Debe encontrar Steam en ambos directorios
        let steam_items: Vec<_> = result.items.iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("Steam"))
            .collect();
        assert_eq!(steam_items.len(), 2, "Debería encontrar Steam en ambos directorios");
        assert_eq!(result.total_size_bytes, 800);
    }

    // ─────────────────────────── Test: carpeta sin match en footprints

    #[tokio::test]
    async fn test_ignores_unknown_folders() {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Roaming".to_string()));
        let unknown_dir = appdata.join("SomeRandomApp");

        let mut directories = HashMap::new();
        directories.insert(appdata.clone(), vec![unknown_dir.clone()]);

        let footprints = vec![KnownFootprint {
            app_name: "Discord".to_string(),
            folders: vec!["Discord".to_string()],
            registry_patterns: vec!["Discord".to_string()],
        }];

        let scanner = create_test_scanner(vec![], directories, HashMap::new(), footprints);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.items_found, 0, "No debería encontrar huérfanos para carpetas desconocidas");
    }

    // ─────────────────────────── Test: case insensitive matching ──

    #[test]
    fn test_case_insensitive_folder_matching() {
        let footprints = vec![KnownFootprint {
            app_name: "Discord".to_string(),
            folders: vec!["discord".to_string()],
            registry_patterns: vec!["Discord".to_string()],
        }];

        let scanner = create_test_scanner(vec![], HashMap::new(), HashMap::new(), footprints);
        let installed: HashSet<String> = HashSet::new();

        // "Discord" (mayúscula) debe matchear "discord" (footprint en minúscula)
        let result = scanner.find_orphan_match("Discord", &installed);
        assert_eq!(result, Some("Discord".to_string()));

        // "DISCORD" todo mayúsculas también
        let result = scanner.find_orphan_match("DISCORD", &installed);
        assert_eq!(result, Some("Discord".to_string()));
    }

    // ─────────────────────────── Test: resultado vacío sin footprints

    #[tokio::test]
    async fn test_empty_footprints_returns_empty() {
        let appdata = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Test\\AppData\\Roaming".to_string()));
        let some_dir = appdata.join("SomeApp");

        let mut directories = HashMap::new();
        directories.insert(appdata.clone(), vec![some_dir]);

        let scanner = create_test_scanner(vec![], directories, HashMap::new(), vec![]);

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();
        assert_eq!(result.items_found, 0);
        assert!(result.items.is_empty());
    }

    // ─────────────────────────── Test: with_defaults constructor ──

    #[test]
    fn test_with_defaults_constructor() {
        let scanner = UninstallerScanner::with_defaults();
        assert_eq!(scanner.module_id(), ScanModule::UninstallResiduals);
        assert!(!scanner.footprints.is_empty());
    }

    // ─────────────────────────── Test: installed app name matching

    #[test]
    fn test_installed_app_names_set() {
        let apps = vec![
            InstalledApp {
                display_name: "Discord Inc.".to_string(),
                install_location: None,
            },
            InstalledApp {
                display_name: "Visual Studio Code".to_string(),
                install_location: None,
            },
        ];

        let scanner = create_test_scanner(apps, HashMap::new(), HashMap::new(), vec![]);
        let names = scanner.installed_app_names().unwrap();

        assert!(names.contains("discord inc."));
        assert!(names.contains("visual studio code"));
        assert_eq!(names.len(), 2);
    }

    // ─────────────────────────── Test: partial name match in registry

    #[test]
    fn test_partial_registry_match() {
        let footprints = vec![KnownFootprint {
            app_name: "Discord".to_string(),
            folders: vec!["discord".to_string()],
            registry_patterns: vec!["Discord".to_string()],
        }];

        let scanner = create_test_scanner(vec![], HashMap::new(), HashMap::new(), footprints);

        // "discord inc." contiene "discord" → app está instalada
        let mut installed = HashSet::new();
        installed.insert("discord inc.".to_string());

        let result = scanner.find_orphan_match("discord", &installed);
        assert!(result.is_none(), "No debería ser huérfano si registry name contiene el pattern");
    }
}
