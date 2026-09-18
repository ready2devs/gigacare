//! Módulo scanner de instaladores residuales en la carpeta Descargas.
//!
//! Detecta archivos `.msi`, `.exe`, `.tmp` en la carpeta de Descargas del usuario,
//! aplicando heurísticas de nombre (setup, install, update) y filtros de antigüedad.
//! Categoriza los hallazgos como `ItemCategory::Installer`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::Result;
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ItemCategory, ItemMetadata, ModuleScanResult, ModuleStatus, ScanFilters, ScanItem};
use crate::scanner::check_cancelled;

// ─────────────────────────── Constantes ───────────────────────────

/// Extensiones de archivos instaladores a detectar.
const INSTALLER_EXTENSIONS: &[&str] = &["msi", "exe", "tmp"];

/// Palabras clave en el nombre del archivo que indican un instalador.
const INSTALLER_KEYWORDS: &[&str] = &["setup", "install", "update"];

// ─────────────────────────── InstallersScanner ────────────────────

/// Scanner de instaladores residuales en la carpeta Descargas.
///
/// Busca archivos con extensiones típicas de instaladores (.msi, .exe, .tmp)
/// y aplica heurísticas de nombre para identificar instaladores residuales.
pub struct InstallersScanner;

impl InstallersScanner {
    /// Crea una nueva instancia del scanner de instaladores.
    pub fn new() -> Self {
        Self
    }

    /// Obtiene la ruta a la carpeta de Descargas del usuario.
    fn downloads_dir() -> Option<PathBuf> {
        dirs::download_dir()
    }

    /// Verifica si un archivo tiene una extensión de instalador.
    fn has_installer_extension(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| {
                let ext_lower = ext.to_lowercase();
                INSTALLER_EXTENSIONS.contains(&ext_lower.as_str())
            })
            .unwrap_or(false)
    }

    /// Verifica si el nombre del archivo contiene palabras clave de instalador.
    fn has_installer_keyword(path: &Path) -> bool {
        path.file_stem()
            .and_then(|name| name.to_str())
            .map(|name| {
                let name_lower = name.to_lowercase();
                INSTALLER_KEYWORDS.iter().any(|kw| name_lower.contains(kw))
            })
            .unwrap_or(false)
    }

    /// Calcula la antigüedad en días de un archivo a partir de su fecha de modificación.
    fn age_in_days(modified: DateTime<Utc>) -> u64 {
        let now = Utc::now();
        let duration = now.signed_duration_since(modified);
        duration.num_days().max(0) as u64
    }

    /// Verifica si un archivo pasa el filtro de antigüedad mínima.
    fn passes_age_filter(modified: DateTime<Utc>, min_age_days: Option<u64>) -> bool {
        match min_age_days {
            Some(min_days) => Self::age_in_days(modified) >= min_days,
            None => true,
        }
    }

    /// Escanea un directorio buscando instaladores residuales.
    ///
    /// Recorre los archivos directos (no recursivo) del directorio indicado,
    /// filtrando por extensión, heurísticas de nombre y antigüedad.
    fn scan_directory(
        dir: &Path,
        cancel: &AtomicBool,
        filters: Option<&ScanFilters>,
    ) -> Result<Vec<ScanItem>> {
        let mut items = Vec::new();
        let min_age_days = filters.and_then(|f| f.min_age_days);

        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return Ok(items), // Directorio inaccesible, retornar vacío
        };

        for entry in entries {
            // Verificar cancelación periódicamente
            check_cancelled(cancel)?;

            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();

            // Solo archivos (no directorios)
            if !path.is_file() {
                continue;
            }

            // Verificar extensión de instalador
            if !Self::has_installer_extension(&path) {
                continue;
            }

            // Verificar heurística de nombre (setup, install, update)
            if !Self::has_installer_keyword(&path) {
                continue;
            }

            // Obtener metadata del archivo
            let metadata = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let modified: DateTime<Utc> = metadata
                .modified()
                .map(DateTime::<Utc>::from)
                .unwrap_or_else(|_| Utc::now());

            // Filtro de antigüedad
            if !Self::passes_age_filter(modified, min_age_days) {
                continue;
            }

            let size_bytes = metadata.len();

            items.push(ScanItem {
                path: path.to_string_lossy().to_string(),
                size_bytes,
                modified_at: modified,
                category: ItemCategory::Installer,
                metadata: ItemMetadata {
                    app_source: Some("downloads".to_string()),
                    project_name: None,
                    days_inactive: Some(Self::age_in_days(modified)),
                    extra: HashMap::new(),
                },
            });
        }

        Ok(items)
    }
}

impl Default for InstallersScanner {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl super::ScannerModule for InstallersScanner {
    fn module_id(&self) -> ScanModule {
        ScanModule::Installers
    }

    async fn scan(
        &self,
        _config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        // Verificar cancelación inicial
        check_cancelled(cancel)?;

        // Emitir evento de inicio (0%)
        let _ = tx.send(ScanProgress {
            module: ScanModule::Installers,
            items_scanned: 0,
            items_found: 0,
            bytes_found: 0,
            percent: 0.0,
            eta_seconds: None,
        }).await;

        // Obtener directorio de Descargas
        let downloads = match Self::downloads_dir() {
            Some(dir) if dir.exists() => dir,
            _ => {
                // Sin directorio de Descargas, retornar resultado vacío
                let _ = tx.send(ScanProgress {
                    module: ScanModule::Installers,
                    items_scanned: 0,
                    items_found: 0,
                    bytes_found: 0,
                    percent: 100.0,
                    eta_seconds: Some(0),
                }).await;
                let duration = start.elapsed();
                return Ok(ModuleScanResult::empty(
                    &ScanModule::Installers,
                    ModuleStatus::Completed,
                    duration.as_millis() as u64,
                ));
            }
        };

        // Escanear el directorio
        let items = Self::scan_directory(&downloads, cancel, filters)?;

        let items_found = items.len() as u64;
        let total_size: u64 = items.iter().map(|i| i.size_bytes).sum();

        // Emitir evento de finalización (100%)
        let _ = tx.send(ScanProgress {
            module: ScanModule::Installers,
            items_scanned: items_found,
            items_found,
            bytes_found: total_size,
            percent: 100.0,
            eta_seconds: Some(0),
        }).await;

        let duration = start.elapsed();
        Ok(ModuleScanResult {
            module_id: ScanModule::Installers.as_str().to_string(),
            status: ModuleStatus::Completed,
            duration_ms: duration.as_millis() as u64,
            items_found,
            total_size_bytes: total_size,
            items,
        })
    }
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::ScannerModule;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    /// Helper: crea un archivo con contenido mínimo en el directorio dado.
    fn create_file(dir: &Path, name: &str, size: usize) -> PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        f.write_all(&vec![0u8; size]).unwrap();
        path
    }

    /// Helper: hace que un archivo parezca antiguo (modifica su timestamp).
    #[cfg(windows)]
    fn set_file_old(path: &Path, days_old: u64) {
        use std::fs::OpenOptions;
        use std::time::{Duration, SystemTime};

        let past = SystemTime::now() - Duration::from_secs(days_old * 86400);
        let file = OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(past).unwrap();
    }

    #[cfg(not(windows))]
    fn set_file_old(path: &Path, days_old: u64) {
        use std::time::{Duration, SystemTime};

        let past = SystemTime::now() - Duration::from_secs(days_old * 86400);
        // En Unix, usamos filetime si disponible; en tests básicos, fs::File::set_modified
        let file = std::fs::OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(past).unwrap();
    }

    // ── Tests de has_installer_extension ──

    #[test]
    fn test_has_installer_extension_msi() {
        assert!(InstallersScanner::has_installer_extension(Path::new("setup.msi")));
    }

    #[test]
    fn test_has_installer_extension_exe() {
        assert!(InstallersScanner::has_installer_extension(Path::new("install.exe")));
    }

    #[test]
    fn test_has_installer_extension_tmp() {
        assert!(InstallersScanner::has_installer_extension(Path::new("update.tmp")));
    }

    #[test]
    fn test_has_installer_extension_case_insensitive() {
        assert!(InstallersScanner::has_installer_extension(Path::new("Setup.MSI")));
        assert!(InstallersScanner::has_installer_extension(Path::new("Install.EXE")));
    }

    #[test]
    fn test_rejects_non_installer_extension() {
        assert!(!InstallersScanner::has_installer_extension(Path::new("document.pdf")));
        assert!(!InstallersScanner::has_installer_extension(Path::new("image.png")));
        assert!(!InstallersScanner::has_installer_extension(Path::new("archive.zip")));
    }

    #[test]
    fn test_rejects_no_extension() {
        assert!(!InstallersScanner::has_installer_extension(Path::new("README")));
    }

    // ── Tests de has_installer_keyword ──

    #[test]
    fn test_has_keyword_setup() {
        assert!(InstallersScanner::has_installer_keyword(Path::new("MyApp_Setup.exe")));
    }

    #[test]
    fn test_has_keyword_install() {
        assert!(InstallersScanner::has_installer_keyword(Path::new("install_program.msi")));
    }

    #[test]
    fn test_has_keyword_update() {
        assert!(InstallersScanner::has_installer_keyword(Path::new("firefox_update.exe")));
    }

    #[test]
    fn test_keyword_case_insensitive() {
        assert!(InstallersScanner::has_installer_keyword(Path::new("SETUP_APP.exe")));
        assert!(InstallersScanner::has_installer_keyword(Path::new("Install_Tool.msi")));
    }

    #[test]
    fn test_no_keyword_rejects() {
        assert!(!InstallersScanner::has_installer_keyword(Path::new("notepad.exe")));
        assert!(!InstallersScanner::has_installer_keyword(Path::new("game.msi")));
    }

    // ── Tests de passes_age_filter ──

    #[test]
    fn test_age_filter_none_passes_all() {
        let now = Utc::now();
        assert!(InstallersScanner::passes_age_filter(now, None));
    }

    #[test]
    fn test_age_filter_old_enough_passes() {
        let old = Utc::now() - chrono::Duration::days(60);
        assert!(InstallersScanner::passes_age_filter(old, Some(30)));
    }

    #[test]
    fn test_age_filter_too_recent_fails() {
        let recent = Utc::now() - chrono::Duration::days(5);
        assert!(!InstallersScanner::passes_age_filter(recent, Some(30)));
    }

    // ── Tests de scan_directory ──

    #[test]
    fn test_scan_directory_detects_installer_files() {
        let dir = TempDir::new().unwrap();
        create_file(dir.path(), "setup_app.msi", 1024);
        create_file(dir.path(), "install_tool.exe", 2048);
        create_file(dir.path(), "update_patch.tmp", 512);
        // Archivo que NO es instalador (sin keyword)
        create_file(dir.path(), "notepad.exe", 100);

        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, None).unwrap();

        assert_eq!(items.len(), 3);
        for item in &items {
            assert_eq!(item.category, ItemCategory::Installer);
            assert_eq!(item.metadata.app_source.as_deref(), Some("downloads"));
        }
    }

    #[test]
    fn test_scan_directory_respects_extension_filter() {
        let dir = TempDir::new().unwrap();
        create_file(dir.path(), "setup_app.pdf", 1024);  // Extensión no válida
        create_file(dir.path(), "setup_app.zip", 2048);  // Extensión no válida

        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, None).unwrap();

        assert_eq!(items.len(), 0);
    }

    #[test]
    fn test_scan_directory_respects_name_heuristic() {
        let dir = TempDir::new().unwrap();
        // Extensiones válidas pero sin keywords de instalador
        create_file(dir.path(), "notepad.exe", 1024);
        create_file(dir.path(), "game.msi", 2048);
        create_file(dir.path(), "random.tmp", 512);

        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, None).unwrap();

        assert_eq!(items.len(), 0);
    }

    #[test]
    fn test_scan_directory_respects_age_filter() {
        let dir = TempDir::new().unwrap();
        let old_file = create_file(dir.path(), "setup_old.msi", 1024);
        let recent_file = create_file(dir.path(), "setup_new.exe", 2048);

        // Hacer viejo un archivo (45 días)
        set_file_old(&old_file, 45);
        // El reciente queda con fecha actual (< 30 días)
        let _ = &recent_file;

        let cancel = AtomicBool::new(false);
        let filters = ScanFilters {
            min_age_days: Some(30),
            ..Default::default()
        };
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, Some(&filters)).unwrap();

        assert_eq!(items.len(), 1);
        assert!(items[0].path.contains("setup_old"));
    }

    #[test]
    fn test_scan_directory_ignores_directories() {
        let dir = TempDir::new().unwrap();
        // Crear un subdirectorio con nombre de instalador
        fs::create_dir(dir.path().join("setup_folder.exe")).unwrap();
        create_file(dir.path(), "install_real.msi", 512);

        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, None).unwrap();

        assert_eq!(items.len(), 1);
        assert!(items[0].path.contains("install_real"));
    }

    #[test]
    fn test_scan_directory_empty() {
        let dir = TempDir::new().unwrap();
        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(dir.path(), &cancel, None).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn test_scan_directory_nonexistent() {
        let cancel = AtomicBool::new(false);
        let items = InstallersScanner::scan_directory(
            Path::new("C:\\nonexistent_dir_abc123"),
            &cancel,
            None,
        ).unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn test_scan_directory_cancelled() {
        let dir = TempDir::new().unwrap();
        create_file(dir.path(), "setup_app.msi", 1024);

        let cancel = AtomicBool::new(true); // Ya cancelado
        let result = InstallersScanner::scan_directory(dir.path(), &cancel, None);

        assert!(result.is_err());
    }

    // ── Tests del trait ScannerModule ──

    #[test]
    fn test_module_id() {
        let scanner = InstallersScanner::new();
        assert_eq!(scanner.module_id(), ScanModule::Installers);
    }

    #[test]
    fn test_default() {
        let scanner = InstallersScanner::default();
        assert_eq!(scanner.module_id(), ScanModule::Installers);
    }

    #[tokio::test]
    async fn test_scan_emits_progress() {
        let scanner = InstallersScanner::new();
        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, mut rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();
        assert_eq!(result.module_id, "installers");
        assert_eq!(result.status, ModuleStatus::Completed);

        // Cerrar sender para drenar
        drop(tx);
        let mut events = Vec::new();
        while let Some(ev) = rx.recv().await {
            events.push(ev);
        }
        // Al menos inicio (0%) y fin (100%)
        assert!(events.len() >= 2);
        assert_eq!(events[0].percent, 0.0);
        assert_eq!(events.last().unwrap().percent, 100.0);
        assert_eq!(events[0].module, ScanModule::Installers);
    }

    #[tokio::test]
    async fn test_scan_cancelled_returns_error() {
        let scanner = InstallersScanner::new();
        let config = AppConfig::default();
        let cancel = AtomicBool::new(true); // Ya cancelado
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await;
        assert!(result.is_err());
    }
}
