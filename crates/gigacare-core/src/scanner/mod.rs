//! Módulo del scanner orquestador de GigaCare.
//!
//! Define el trait `ScannerModule` que cada módulo de escaneo debe implementar,
//! y la struct `Scanner` que coordina la ejecución de múltiples módulos
//! con soporte de cancelación y eventos de progreso.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::{CoreError, Result};
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ModuleScanResult, ModuleStatus, Platform, ScanFilters, ScanResult};

// ─────────────────────────── Trait ScannerModule ──────────────────

/// Trait que cada módulo de escaneo individual debe implementar.
///
/// Los módulos concretos (messaging_cache, dev_dependencies, etc.) se
/// registrarán en futuras tareas (T013-T018). Por ahora, el Scanner
/// usa implementaciones stub internas.
#[async_trait]
pub trait ScannerModule: Send + Sync {
    /// Retorna el tipo de módulo que implementa.
    fn module_id(&self) -> ScanModule;

    /// Ejecuta el escaneo del módulo.
    ///
    /// # Argumentos
    /// - `config`: Configuración de la aplicación.
    /// - `cancel`: Flag atómico de cancelación (verificar periódicamente).
    /// - `tx`: Canal para emitir eventos de progreso.
    /// - `filters`: Filtros opcionales para personalizar el escaneo.
    async fn scan(
        &self,
        config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult>;
}

// ─────────────────────────── Scanner ──────────────────────────────

/// Orquestador principal de escaneo de GigaCare.
///
/// Coordina la ejecución secuencial de múltiples módulos de escaneo,
/// emitiendo eventos de progreso por un canal `mpsc` y soportando
/// cancelación cooperativa mediante un `AtomicBool`.
pub struct Scanner {
    /// Configuración de la aplicación.
    config: AppConfig,
    /// Flag de cancelación compartido.
    cancel_flag: Arc<AtomicBool>,
    /// Emisor de eventos de progreso de escaneo.
    progress_tx: mpsc::Sender<ScanProgress>,
}

impl Scanner {
    /// Crea un nuevo Scanner con la configuración y canal de progreso dados.
    pub fn new(config: AppConfig, progress_tx: mpsc::Sender<ScanProgress>) -> Self {
        Self {
            config,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            progress_tx,
        }
    }

    /// Solicita la cancelación de cualquier escaneo en curso.
    ///
    /// Los módulos de escaneo verifican esta flag periódicamente y
    /// retornan con status `Cancelled` si está activa.
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    /// Verifica si la cancelación ha sido solicitada.
    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::SeqCst)
    }

    /// Resetea la flag de cancelación (para reutilizar el scanner).
    pub fn reset_cancel(&self) {
        self.cancel_flag.store(false, Ordering::SeqCst);
    }

    /// Retorna una referencia al flag de cancelación (para compartir con módulos).
    pub fn cancel_flag(&self) -> &Arc<AtomicBool> {
        &self.cancel_flag
    }

    /// Retorna una referencia a la configuración.
    pub fn config(&self) -> &AppConfig {
        &self.config
    }

    /// Escanea todos los módulos solicitados (o todos si `modules` es None).
    ///
    /// Ejecuta cada módulo secuencialmente, emitiendo eventos de progreso
    /// por el canal mpsc. Si se solicita cancelación, los módulos restantes
    /// reciben status `Cancelled`.
    ///
    /// # Argumentos
    /// - `modules`: Lista opcional de módulos a escanear. Si es None, escanea todos.
    ///
    /// # Retorna
    /// Un `ScanResult` completo con los resultados de todos los módulos.
    pub async fn scan_smart_care(
        &self,
        modules: Option<Vec<ScanModule>>,
    ) -> Result<ScanResult> {
        let modules_to_scan = modules.unwrap_or_else(ScanModule::all);
        let mut result = ScanResult::new(Platform::Windows);

        for (idx, module) in modules_to_scan.iter().enumerate() {
            // Verificar cancelación antes de cada módulo
            if self.is_cancelled() {
                // Marcar módulos restantes como cancelados
                for remaining in &modules_to_scan[idx..] {
                    result.add_module(ModuleScanResult::empty(
                        remaining,
                        ModuleStatus::Cancelled,
                        0,
                    ));
                }
                break;
            }

            let module_result = self.scan_module_internal(module, None).await?;
            result.add_module(module_result);
        }

        Ok(result)
    }

    /// Escanea un módulo individual con filtros opcionales.
    ///
    /// # Argumentos
    /// - `module`: El módulo a escanear.
    /// - `filters`: Filtros opcionales para personalizar el escaneo.
    pub async fn scan_module(
        &self,
        module: ScanModule,
        filters: Option<ScanFilters>,
    ) -> Result<ModuleScanResult> {
        self.scan_module_internal(&module, filters.as_ref()).await
    }

    /// Implementación interna del escaneo de un módulo.
    ///
    /// Por ahora es un stub que emite un evento de progreso al 100%
    /// y retorna un resultado vacío. Los módulos concretos se
    /// implementarán en T013-T018.
    async fn scan_module_internal(
        &self,
        module: &ScanModule,
        _filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        // Verificar cancelación
        if self.is_cancelled() {
            return Ok(ModuleScanResult::empty(module, ModuleStatus::Cancelled, 0));
        }

        // Emitir evento de inicio (0%)
        let _ = self.progress_tx.send(ScanProgress {
            module: *module,
            items_scanned: 0,
            items_found: 0,
            bytes_found: 0,
            percent: 0.0,
            eta_seconds: None,
        }).await;

        // TODO: Aquí se delegará al ScannerModule concreto registrado (T013-T018).
        // Por ahora, emitimos progreso al 100% y retornamos resultado vacío.

        // Emitir evento de finalización (100%)
        let _ = self.progress_tx.send(ScanProgress {
            module: *module,
            items_scanned: 0,
            items_found: 0,
            bytes_found: 0,
            percent: 100.0,
            eta_seconds: Some(0),
        }).await;

        let duration = start.elapsed();
        Ok(ModuleScanResult::empty(
            module,
            ModuleStatus::Completed,
            duration.as_millis() as u64,
        ))
    }
}

/// Función helper para verificar cancelación dentro de un módulo.
///
/// Retorna `Err(CoreError::Cancelled)` si la flag de cancelación está activa.
pub fn check_cancelled(cancel: &AtomicBool) -> Result<()> {
    if cancel.load(Ordering::SeqCst) {
        Err(CoreError::Cancelled)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scanner_new() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);
        assert!(!scanner.is_cancelled());
    }

    #[tokio::test]
    async fn test_scanner_cancel() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);

        assert!(!scanner.is_cancelled());
        scanner.cancel();
        assert!(scanner.is_cancelled());
    }

    #[tokio::test]
    async fn test_scanner_reset_cancel() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);

        scanner.cancel();
        assert!(scanner.is_cancelled());
        scanner.reset_cancel();
        assert!(!scanner.is_cancelled());
    }

    #[tokio::test]
    async fn test_scanner_emits_progress_events() {
        let config = AppConfig::default();
        let (tx, mut rx) = mpsc::channel(64);
        let scanner = Scanner::new(config, tx);

        // Escanear un solo módulo
        let result = scanner.scan_module(ScanModule::SystemTemp, None).await.unwrap();
        assert_eq!(result.module_id, "system_temp");
        assert_eq!(result.status, ModuleStatus::Completed);

        // Cerrar el sender para que el receiver pueda iterar
        drop(scanner);

        // Verificar que recibimos eventos de progreso (al menos inicio y fin)
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }
        assert!(events.len() >= 2, "Se esperaban al menos 2 eventos, se recibieron {}", events.len());

        // Primer evento: 0%
        assert_eq!(events[0].percent, 0.0);
        assert_eq!(events[0].module, ScanModule::SystemTemp);

        // Último evento: 100%
        assert_eq!(events.last().unwrap().percent, 100.0);
    }

    #[tokio::test]
    async fn test_scan_smart_care_all_modules() {
        let config = AppConfig::default();
        let (tx, mut rx) = mpsc::channel(128);
        let scanner = Scanner::new(config, tx);

        let result = scanner.scan_smart_care(None).await.unwrap();

        // Debe haber un resultado por cada módulo
        assert_eq!(result.modules.len(), ScanModule::all().len());

        // Todos deben estar completados (sin cancelación)
        for module in &result.modules {
            assert_eq!(module.status, ModuleStatus::Completed);
        }

        // Los stubs retornan 0 items
        assert_eq!(result.total_items, 0);
        assert_eq!(result.total_recoverable_bytes, 0);

        // Verificar UUID válido
        assert!(!result.id.is_empty());

        // Verificar que se emitieron eventos
        drop(scanner);
        let mut event_count = 0;
        while rx.try_recv().is_ok() {
            event_count += 1;
        }
        // Al menos 2 eventos por módulo (inicio + fin)
        assert!(event_count >= ScanModule::all().len() * 2);
    }

    #[tokio::test]
    async fn test_scan_smart_care_selected_modules() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(64);
        let scanner = Scanner::new(config, tx);

        let modules = vec![ScanModule::SystemTemp, ScanModule::Installers];
        let result = scanner.scan_smart_care(Some(modules)).await.unwrap();

        assert_eq!(result.modules.len(), 2);
        assert_eq!(result.modules[0].module_id, "system_temp");
        assert_eq!(result.modules[1].module_id, "installers");
    }

    #[tokio::test]
    async fn test_scan_smart_care_cancellation() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(64);
        let scanner = Scanner::new(config, tx);

        // Cancelar inmediatamente
        scanner.cancel();

        let result = scanner.scan_smart_care(None).await.unwrap();

        // Todos los módulos deben estar cancelados
        assert!(!result.modules.is_empty());
        for module in &result.modules {
            assert_eq!(module.status, ModuleStatus::Cancelled);
        }
    }

    #[tokio::test]
    async fn test_scan_module_individual() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);

        let result = scanner
            .scan_module(ScanModule::DevDependencies, None)
            .await
            .unwrap();

        assert_eq!(result.module_id, "dev_dependencies");
        assert_eq!(result.status, ModuleStatus::Completed);
        assert_eq!(result.items_found, 0); // Stub
        assert!(result.items.is_empty());
    }

    #[tokio::test]
    async fn test_scan_module_with_filters() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);

        let filters = ScanFilters {
            min_age_days: Some(30),
            max_size_bytes: Some(1024 * 1024),
            ..Default::default()
        };

        let result = scanner
            .scan_module(ScanModule::MessagingCache, Some(filters))
            .await
            .unwrap();

        assert_eq!(result.module_id, "messaging_cache");
        assert_eq!(result.status, ModuleStatus::Completed);
    }

    #[tokio::test]
    async fn test_scan_module_cancelled() {
        let config = AppConfig::default();
        let (tx, _rx) = mpsc::channel(32);
        let scanner = Scanner::new(config, tx);

        scanner.cancel();
        let result = scanner
            .scan_module(ScanModule::PhotoDuplicates, None)
            .await
            .unwrap();

        assert_eq!(result.module_id, "photo_duplicates");
        assert_eq!(result.status, ModuleStatus::Cancelled);
    }

    #[test]
    fn test_check_cancelled_not_cancelled() {
        let flag = AtomicBool::new(false);
        assert!(check_cancelled(&flag).is_ok());
    }

    #[test]
    fn test_check_cancelled_is_cancelled() {
        let flag = AtomicBool::new(true);
        let result = check_cancelled(&flag);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CoreError::Cancelled));
    }
}