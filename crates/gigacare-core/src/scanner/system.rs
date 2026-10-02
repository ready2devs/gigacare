//! Módulo scanner::system — escaneo de temporales y residuales del sistema Windows.
//!
//! Escanea rutas de archivos temporales, residuos de Windows Update,
//! crash dumps, Prefetch obsoleto, cachés de miniaturas,
//! Delivery Optimization, Windows Error Reporting y Windows.old.

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
use crate::scanner::{check_cancelled, ScannerModule};

// ─────────────────────────── SystemScanner ─────────────────────────

/// Scanner de archivos temporales y residuales del sistema Windows.
///
/// Escanea las siguientes ubicaciones:
/// - %TEMP% y %SystemRoot%\Temp
/// - SoftwareDistribution/Download (Windows Update)
/// - Crash dumps (*.dmp)
/// - Prefetch obsoleto
/// - Cachés de miniaturas (thumbcache_*.db, Thumbs.db)
pub struct SystemScanner;

impl SystemScanner {
    /// Crea una nueva instancia del scanner del sistema.
    pub fn new() -> Self {
        Self
    }

    /// Obtiene las rutas a escanear en el sistema.
    ///
    /// Retorna una lista de tuplas (ruta, booleano_recursivo).
    fn system_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();

        // %TEMP%
        if let Ok(temp) = std::env::var("TEMP") {
            paths.push(PathBuf::from(temp));
        } else if let Ok(tmp) = std::env::var("TMP") {
            paths.push(PathBuf::from(tmp));
        }

        // %SystemRoot%\Temp
        if let Ok(sys_root) = std::env::var("SystemRoot") {
            let sys_temp = PathBuf::from(&sys_root).join("Temp");
            paths.push(sys_temp);

            // SoftwareDistribution/Download (Windows Update)
            let sw_dist = PathBuf::from(&sys_root).join("SoftwareDistribution").join("Download");
            paths.push(sw_dist);

            // Prefetch
            let prefetch = PathBuf::from(&sys_root).join("Prefetch");
            paths.push(prefetch);

            // Delivery Optimization files (T003)
            let delivery_opt = PathBuf::from(&sys_root)
                .join("ServiceProfiles")
                .join("NetworkService")
                .join("AppData")
                .join("Local")
                .join("Microsoft")
                .join("Windows")
                .join("DeliveryOptimization");
            paths.push(delivery_opt);

            // Windows.old (si existe) (T003)
            let windows_old = PathBuf::from(&sys_root).parent()
                .map(|p| p.join("Windows.old"))
                .unwrap_or_else(|| PathBuf::from(r"C:Windows.old"));
            if windows_old.exists() {
                paths.push(windows_old);
            }
        }

        // Windows Error Reporting (T003)
        if let Ok(program_data) = std::env::var("ProgramData") {
            let wer = PathBuf::from(&program_data)
                .join("Microsoft")
                .join("Windows")
                .join("WER");
            paths.push(wer);
        }

        paths
    }

    /// Determina si un archivo califica como residual del sistema.
    ///
    /// Retorna Some((category, source_hint, safe)) si califica, None si no.
    /// - source_hint: subcategoría semántica (ej: "temp_user", "delivery_optimization")
    /// - safe: true = limpieza segura sin confirmación extra
    fn classify_file(path: &Path) -> Option<(ItemCategory, &'static str, bool)> {
        let file_name = path.file_name()?.to_str()?;
        let file_name_lower = file_name.to_lowercase();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let path_str = path.to_string_lossy().to_lowercase();

        // Crash dumps
        if ext == "dmp" {
            return Some((ItemCategory::Temp, "crash_dump", true));
        }

        // Thumbcache / Thumbs.db
        if file_name_lower.starts_with("thumbcache_") && file_name_lower.ends_with(".db") {
            return Some((ItemCategory::Cache, "thumbcache", true));
        }
        if file_name_lower == "thumbs.db" {
            return Some((ItemCategory::Cache, "thumbs_db", true));
        }

        // Prefetch
        if ext == "pf" {
            return Some((ItemCategory::Cache, "prefetch", false)); // informacional, no safe auto
        }

        // Delivery Optimization (T003)
        if path_str.contains("deliveryoptimization") {
            return Some((ItemCategory::Cache, "delivery_optimization", true));
        }

        // Windows Error Reporting (T003)
        if path_str.contains("\\wer\\") || path_str.contains("/wer/") {
            return Some((ItemCategory::Temp, "error_reporting", true));
        }

        // Windows.old (T003)
        if path_str.contains("windows.old") {
            return Some((ItemCategory::Temp, "windows_old", true));
        }

        // SoftwareDistribution/Download (Windows Update)
        if path_str.contains("softwaredistribution\\download") || path_str.contains("softwaredistribution/download") {
            return Some((ItemCategory::Cache, "windows_update", true));
        }

        // Archivos de log temporales
        if ext == "log" && is_in_temp_dir(path) {
            return Some((ItemCategory::Temp, "temp_log", true));
        }

        // Archivos temporales comunes
        if ext == "tmp" || ext == "temp" || ext == "bak" || ext == "old" {
            // Distinguir temp_user vs temp_system
            if path_str.contains("\\system32\\") || path_str.contains("\\windows\\temp") {
                return Some((ItemCategory::Temp, "temp_system", true));
            }
            return Some((ItemCategory::Temp, "temp_user", true));
        }

        // Archivos sin extensión o genéricos en directorios temp
        if is_in_temp_dir(path) {
            if path_str.contains("\\windows\\temp") || path_str.contains("\\system32\\") {
                return Some((ItemCategory::Temp, "temp_system", true));
            }
            return Some((ItemCategory::Temp, "temp_user", true));
        }

        None
    }

    /// Formatea los días de antigüedad en texto legible.
    ///
    /// Ejemplos: "2 meses", "1 mes", "15 días", "1 año"
    pub fn format_age_display(days: u64) -> String {
        if days >= 365 {
            let years = days / 365;
            if years == 1 { "1 año".to_string() } else { format!("{} años", years) }
        } else if days >= 30 {
            let months = days / 30;
            if months == 1 { "1 mes".to_string() } else { format!("{} meses", months) }
        } else if days >= 7 {
            let weeks = days / 7;
            if weeks == 1 { "1 semana".to_string() } else { format!("{} semanas", weeks) }
        } else {
            format!("{} días", days)
        }
    }

    /// Escanea una ruta recursivamente buscando archivos residuales.
    fn scan_directory(
        dir: &Path,
        min_age: chrono::Duration,
        cancel: &AtomicBool,
        items: &mut Vec<ScanItem>,
        scanned_count: &mut u64,
        filters: Option<&ScanFilters>,
    ) -> Result<()> {
        if !dir.exists() || !dir.is_dir() {
            return Ok(());
        }

        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return Ok(()), // Permiso denegado u otro error, continuar
        };

        for entry in entries {
            // Verificar cancelación periódicamente
            check_cancelled(cancel)?;

            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();

            if path.is_dir() {
                // Recursión en subdirectorios
                Self::scan_directory(&path, min_age, cancel, items, scanned_count, filters)?;
                continue;
            }

            *scanned_count += 1;

            // Clasificar el archivo
            let (category, source_hint, safe) = match Self::classify_file(&path) {
                Some(c) => c,
                None => continue,
            };

            // Obtener metadata del archivo
            let metadata = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let modified: DateTime<Utc> = match metadata.modified() {
                Ok(t) => t.into(),
                Err(_) => continue,
            };

            let file_size = metadata.len();
            let age = Utc::now() - modified;

            // Verificar antigüedad mínima
            if age < min_age {
                continue;
            }

            // Aplicar filtros adicionales
            if let Some(f) = filters {
                if let Some(max_size) = f.max_size_bytes {
                    if file_size > max_size {
                        continue;
                    }
                }
                if let Some(min_size) = f.min_size_bytes {
                    if file_size < min_size {
                        continue;
                    }
                }
                if let Some(ref cats) = f.categories {
                    if !cats.contains(&category) {
                        continue;
                    }
                }
                if let Some(ref excluded) = f.excluded_paths {
                    let path_str = path.to_string_lossy();
                    if excluded.iter().any(|ex| path_str.contains(ex.as_str())) {
                        continue;
                    }
                }
            }

            let days_inactive = age.num_days().max(0) as u64;
            let age_display = Self::format_age_display(days_inactive);

            items.push(ScanItem {
                path: path.to_string_lossy().to_string(),
                size_bytes: file_size,
                modified_at: modified,
                category,
                metadata: ItemMetadata {
                    app_source: Some("system".to_string()),
                    project_name: None,
                    days_inactive: Some(days_inactive),
                    extra: {
                        let mut map = std::collections::HashMap::new();
                        map.insert(
                            "source_type".to_string(),
                            serde_json::Value::String(source_hint.to_string()),
                        );
                        map.insert(
                            "safe".to_string(),
                            serde_json::Value::Bool(safe),
                        );
                        map.insert(
                            "age_display".to_string(),
                            serde_json::Value::String(age_display),
                        );
                        map
                    },
                },
            });
        }

        Ok(())
    }
}

impl Default for SystemScanner {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper: determina si una ruta está dentro de un directorio temporal.
fn is_in_temp_dir(path: &Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    path_str.contains("\\temp\\")
        || path_str.contains("/temp/")
        || path_str.ends_with("\\temp")
        || path_str.ends_with("/temp")
}

#[async_trait]
impl ScannerModule for SystemScanner {
    fn module_id(&self) -> ScanModule {
        ScanModule::SystemTemp
    }

    async fn scan(
        &self,
        config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        // Verificar cancelación inicial
        check_cancelled(cancel)?;

        // Emitir evento de inicio
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::SystemTemp,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 0.0,
                eta_seconds: None,
            })
            .await;

        // Determinar antigüedad mínima
        let min_age_days = if let Some(f) = filters {
            f.min_age_days.unwrap_or(config.scanning.temp_min_age_days as u64)
        } else {
            config.scanning.temp_min_age_days as u64
        };
        let min_age = chrono::Duration::days(min_age_days as i64);

        // Obtener rutas del sistema
        let paths = Self::system_paths();
        let total_paths = paths.len() as f32;
        let mut items = Vec::new();
        let mut scanned_count: u64 = 0;

        for (idx, dir) in paths.iter().enumerate() {
            check_cancelled(cancel)?;

            Self::scan_directory(dir, min_age, cancel, &mut items, &mut scanned_count, filters)?;

            // Emitir progreso parcial
            let percent = ((idx + 1) as f32 / total_paths * 100.0).min(99.0);
            let _ = tx
                .send(ScanProgress {
                    module: ScanModule::SystemTemp,
                    items_scanned: scanned_count,
                    items_found: items.len() as u64,
                    bytes_found: items.iter().map(|i| i.size_bytes).sum(),
                    percent,
                    eta_seconds: None,
                })
                .await;
        }

        // También buscar crash dumps en ubicaciones estándar
        // (si no se cubrieron ya por las rutas del sistema)
        let extra_dmp_paths = [
            PathBuf::from("C:\\Windows\\Minidump"),
            PathBuf::from("C:\\Windows\\MEMORY.DMP").parent().unwrap_or(Path::new("C:\\Windows")).to_path_buf(),
        ];
        for dir in &extra_dmp_paths {
            if dir.exists() {
                // Solo buscar .dmp en este directorio (no recursivo)
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            if let Some(ext) = path.extension() {
                                if ext.to_str().map(|s| s.to_lowercase()) == Some("dmp".to_string()) {
                                    // Verificar que no esté ya incluido
                                    let path_str = path.to_string_lossy().to_string();
                                    if items.iter().any(|i| i.path == path_str) {
                                        continue;
                                    }
                                    if let Ok(meta) = std::fs::metadata(&path) {
                                        if let Ok(mod_time) = meta.modified() {
                                            let modified: DateTime<Utc> = mod_time.into();
                                            let age = Utc::now() - modified;
                                            if age >= min_age {
                                                let days_inactive = age.num_days().max(0) as u64;
                                                let age_display = Self::format_age_display(days_inactive);
                                                items.push(ScanItem {
                                                    path: path_str,
                                                    size_bytes: meta.len(),
                                                    modified_at: modified,
                                                    category: ItemCategory::Temp,
                                                    metadata: ItemMetadata {
                                                        app_source: Some("system".to_string()),
                                                        project_name: None,
                                                        days_inactive: Some(days_inactive),
                                                        extra: {
                                                            let mut map = std::collections::HashMap::new();
                                                            map.insert(
                                                                "source_type".to_string(),
                                                                serde_json::Value::String("crash_dump".to_string()),
                                                            );
                                                            map.insert(
                                                                "safe".to_string(),
                                                                serde_json::Value::Bool(true),
                                                            );
                                                            map.insert(
                                                                "age_display".to_string(),
                                                                serde_json::Value::String(age_display),
                                                            );
                                                            map
                                                        },
                                                    },
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Buscar thumbcache en rutas de usuario
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let explorer_cache = PathBuf::from(&local_app_data)
                .join("Microsoft")
                .join("Windows")
                .join("Explorer");
            if explorer_cache.exists() {
                if let Ok(entries) = std::fs::read_dir(&explorer_cache) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let fname = path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_lowercase();
                            if fname.starts_with("thumbcache_") && fname.ends_with(".db") {
                                let path_str = path.to_string_lossy().to_string();
                                if items.iter().any(|i| i.path == path_str) {
                                    continue;
                                }
                                if let Ok(meta) = std::fs::metadata(&path) {
                                    if let Ok(mod_time) = meta.modified() {
                                        let modified: DateTime<Utc> = mod_time.into();
                                        let age = Utc::now() - modified;
                                        if age >= min_age {
                                            let days_inactive = age.num_days().max(0) as u64;
                                            let age_display = Self::format_age_display(days_inactive);
                                            items.push(ScanItem {
                                                path: path_str,
                                                size_bytes: meta.len(),
                                                modified_at: modified,
                                                category: ItemCategory::Cache,
                                                metadata: ItemMetadata {
                                                    app_source: Some("system".to_string()),
                                                    project_name: None,
                                                    days_inactive: Some(days_inactive),
                                                    extra: {
                                                        let mut map = std::collections::HashMap::new();
                                                        map.insert(
                                                            "source_type".to_string(),
                                                            serde_json::Value::String("thumbcache".to_string()),
                                                        );
                                                        map.insert(
                                                            "safe".to_string(),
                                                            serde_json::Value::Bool(true),
                                                        );
                                                        map.insert(
                                                            "age_display".to_string(),
                                                            serde_json::Value::String(age_display),
                                                        );
                                                        map
                                                    },
                                                },
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let duration = start.elapsed();
        let total_size: u64 = items.iter().map(|i| i.size_bytes).sum();
        let items_found = items.len() as u64;

        // Emitir evento de finalización
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::SystemTemp,
                items_scanned: scanned_count,
                items_found,
                bytes_found: total_size,
                percent: 100.0,
                eta_seconds: Some(0),
            })
            .await;

        Ok(ModuleScanResult {
            module_id: ScanModule::SystemTemp.as_str().to_string(),
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
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    /// Helper: crea un archivo con contenido y modifica su timestamp para simular antigüedad.
    fn create_old_file(dir: &Path, name: &str, content: &[u8], days_old: u64) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(content).unwrap();
        drop(file);

        // Configurar timestamp antiguo
        let old_time = std::time::SystemTime::now()
            - std::time::Duration::from_secs(days_old * 24 * 3600);
        filetime::set_file_mtime(&path, filetime::FileTime::from_system_time(old_time)).unwrap();

        path
    }

    /// Helper: crea un archivo reciente (hoy).
    fn create_recent_file(dir: &Path, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(content).unwrap();
        path
    }

    #[test]
    fn test_system_scanner_module_id() {
        let scanner = SystemScanner::new();
        assert_eq!(scanner.module_id(), ScanModule::SystemTemp);
    }

    #[test]
    fn test_system_scanner_default() {
        let scanner = SystemScanner::default();
        assert_eq!(scanner.module_id(), ScanModule::SystemTemp);
    }

    #[test]
    fn test_classify_tmp_file() {
        let path = Path::new("C:\\Users\\test\\AppData\\Local\\Temp\\foo.tmp");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_some());
        let (cat, _, _) = result.unwrap();
        assert_eq!(cat, ItemCategory::Temp);
    }

    #[test]
    fn test_classify_dmp_file() {
        let path = Path::new("C:\\Windows\\Minidump\\crash.dmp");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_some());
        let (cat, hint, _) = result.unwrap();
        assert_eq!(cat, ItemCategory::Temp);
        assert_eq!(hint, "crash_dump");
    }

    #[test]
    fn test_classify_thumbcache() {
        let path = Path::new("C:\\Users\\test\\Explorer\\thumbcache_256.db");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_some());
        let (cat, hint, _) = result.unwrap();
        assert_eq!(cat, ItemCategory::Cache);
        assert_eq!(hint, "thumbcache");
    }

    #[test]
    fn test_classify_thumbs_db() {
        let path = Path::new("C:\\Users\\test\\Pictures\\Thumbs.db");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_some());
        let (cat, hint, _) = result.unwrap();
        assert_eq!(cat, ItemCategory::Cache);
        assert_eq!(hint, "thumbs_db");
    }

    #[test]
    fn test_classify_prefetch() {
        let path = Path::new("C:\\Windows\\Prefetch\\NOTEPAD.EXE-12345.pf");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_some());
        let (cat, hint, _) = result.unwrap();
        assert_eq!(cat, ItemCategory::Cache);
        assert_eq!(hint, "prefetch");
    }

    #[test]
    fn test_classify_unknown_file_not_in_temp() {
        let path = Path::new("C:\\Users\\test\\Documents\\report.docx");
        let result = SystemScanner::classify_file(path);
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_scan_detects_tmp_files() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        // Crear archivos .tmp antiguos (3 días)
        create_old_file(dir, "test1.tmp", b"temp content 1", 3);
        create_old_file(dir, "test2.tmp", b"temp content 2 longer", 5);

        // Escanear directamente
        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|i| i.category == ItemCategory::Temp));
        assert!(scanned >= 2);
    }

    #[tokio::test]
    async fn test_scan_detects_dmp_files() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "crash.dmp", b"minidump data", 10);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].category, ItemCategory::Temp);
        assert!(items[0].path.contains("crash.dmp"));
        let source = items[0].metadata.extra.get("source_type").unwrap();
        assert_eq!(source, "crash_dump");
    }

    #[tokio::test]
    async fn test_scan_detects_thumbcache() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "thumbcache_256.db", b"thumbcache data", 7);
        create_old_file(dir, "Thumbs.db", b"thumbs data", 14);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|i| i.category == ItemCategory::Cache));
    }

    #[tokio::test]
    async fn test_scan_respects_min_age() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        // Archivo antiguo (10 días) — debe detectarse con min_age=7
        create_old_file(dir, "old.tmp", b"old data", 10);

        // Archivo reciente (hoy) — no debe detectarse
        create_recent_file(dir, "recent.tmp", b"recent data");

        // Archivo de 3 días — no debe detectarse con min_age=7
        create_old_file(dir, "medium.tmp", b"medium data", 3);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(7);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        // Solo el archivo de 10 días debe pasar
        assert_eq!(items.len(), 1);
        assert!(items[0].path.contains("old.tmp"));
    }

    #[tokio::test]
    async fn test_scan_respects_cancellation() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "file1.tmp", b"data", 3);

        let cancel = AtomicBool::new(true); // pre-cancelado
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        let result = SystemScanner::scan_directory(
            dir, min_age, &cancel, &mut items, &mut scanned, None,
        );
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_scan_with_filters_max_size() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        // Archivo pequeño
        create_old_file(dir, "small.tmp", b"sm", 5);
        // Archivo grande
        create_old_file(dir, "large.tmp", &vec![0u8; 10_000], 5);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);
        let filters = ScanFilters {
            max_size_bytes: Some(100),
            ..Default::default()
        };

        SystemScanner::scan_directory(
            dir, min_age, &cancel, &mut items, &mut scanned, Some(&filters),
        )
        .unwrap();

        assert_eq!(items.len(), 1);
        assert!(items[0].path.contains("small.tmp"));
    }

    #[tokio::test]
    async fn test_scan_with_filters_categories() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "file.tmp", b"temp", 5);
        create_old_file(dir, "thumbcache_64.db", b"cache", 5);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        // Solo Cache
        let filters = ScanFilters {
            categories: Some(vec![ItemCategory::Cache]),
            ..Default::default()
        };

        SystemScanner::scan_directory(
            dir, min_age, &cancel, &mut items, &mut scanned, Some(&filters),
        )
        .unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].category, ItemCategory::Cache);
    }

    #[tokio::test]
    async fn test_full_scan_via_trait() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "sys.tmp", b"temporary", 5);
        create_old_file(dir, "dump.dmp", b"dump data", 3);

        // Usar el trait con config que apunta a un directorio controlado no es
        // posible directamente (system_paths usa env vars), pero podemos verificar
        // que el scanner se ejecuta sin errores y retorna el tipo correcto.
        let scanner = SystemScanner::new();
        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(64);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.module_id, "system_temp");
        assert_eq!(result.status, ModuleStatus::Completed);
        // items_found puede ser 0 o más según el sistema real
        assert!(result.duration_ms < 120_000); // Menos de 2 minutos
    }

    #[tokio::test]
    async fn test_scan_recursive_subdirectories() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();
        let sub = dir.join("subdir");
        fs::create_dir(&sub).unwrap();

        create_old_file(&sub, "nested.tmp", b"nested temp", 5);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        assert_eq!(items.len(), 1);
        assert!(items[0].path.contains("nested.tmp"));
    }

    #[tokio::test]
    async fn test_scan_empty_directory() {
        let temp_dir = TempDir::new().unwrap();

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(
            temp_dir.path(), min_age, &cancel, &mut items, &mut scanned, None,
        )
        .unwrap();

        assert!(items.is_empty());
        assert_eq!(scanned, 0);
    }

    #[tokio::test]
    async fn test_scan_nonexistent_directory() {
        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        let result = SystemScanner::scan_directory(
            Path::new("C:\\nonexistent_dir_xyz"),
            min_age,
            &cancel,
            &mut items,
            &mut scanned,
            None,
        );

        assert!(result.is_ok());
        assert!(items.is_empty());
    }

    #[tokio::test]
    async fn test_scan_item_metadata() {
        let temp_dir = TempDir::new().unwrap();
        let dir = temp_dir.path();

        create_old_file(dir, "data.tmp", b"content here", 10);

        let cancel = AtomicBool::new(false);
        let mut items = Vec::new();
        let mut scanned = 0u64;
        let min_age = chrono::Duration::days(1);

        SystemScanner::scan_directory(dir, min_age, &cancel, &mut items, &mut scanned, None)
            .unwrap();

        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.metadata.app_source.as_deref(), Some("system"));
        assert!(item.metadata.days_inactive.unwrap() >= 9); // ~10 días
        assert!(item.metadata.extra.contains_key("source_type"));
    }

    #[test]
    fn test_classify_delivery_optimization() {
        let path = Path::new(r"C:\Windows\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\cache.dat");
        let (cat, hint, safe) = SystemScanner::classify_file(path).unwrap();
        assert_eq!(cat, ItemCategory::Cache);
        assert_eq!(hint, "delivery_optimization");
        assert!(safe);
    }

    #[test]
    fn test_classify_wer() {
        let path = Path::new(r"C:\ProgramData\Microsoft\Windows\WER\ReportArchive\test.wer");
        let (cat, hint, safe) = SystemScanner::classify_file(path).unwrap();
        assert_eq!(cat, ItemCategory::Temp);
        assert_eq!(hint, "error_reporting");
        assert!(safe);
    }

    #[test]
    fn test_classify_windows_old() {
        let path = Path::new(r"C:\Windows.old\somefile.old");
        let (cat, hint, safe) = SystemScanner::classify_file(path).unwrap();
        assert_eq!(cat, ItemCategory::Temp);
        assert_eq!(hint, "windows_old");
        assert!(safe);
    }

    #[test]
    fn test_classify_windows_update() {
        let path = Path::new(r"C:\Windows\SoftwareDistribution\Download\update.cab");
        let (cat, hint, safe) = SystemScanner::classify_file(path).unwrap();
        assert_eq!(cat, ItemCategory::Cache);
        assert_eq!(hint, "windows_update");
        assert!(safe);
    }

    #[test]
    fn test_format_age_display() {
        assert_eq!(SystemScanner::format_age_display(0), "0 días");
        assert_eq!(SystemScanner::format_age_display(5), "5 días");
        assert_eq!(SystemScanner::format_age_display(7), "1 semana");
        assert_eq!(SystemScanner::format_age_display(14), "2 semanas");
        assert_eq!(SystemScanner::format_age_display(30), "1 mes");
        assert_eq!(SystemScanner::format_age_display(65), "2 meses");
        assert_eq!(SystemScanner::format_age_display(365), "1 año");
        assert_eq!(SystemScanner::format_age_display(800), "2 años");
    }

    #[test]
    fn test_is_in_temp_dir() {
        assert!(is_in_temp_dir(Path::new(r"C:\Users\test\AppData\Local\Temp\foo.txt")));
        assert!(!is_in_temp_dir(Path::new(r"C:\Users\test\Documents\foo.txt")));
    }
}
