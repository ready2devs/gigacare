//! Módulo scanner de cachés de mensajería (WhatsApp Desktop / Telegram Desktop).
//!
//! Detecta y cataloga archivos de caché recuperables en las carpetas de datos
//! de WhatsApp y Telegram en Windows, respetando la regla RF-203:
//! **NUNCA** toca bases de datos, claves de cifrado ni archivos de configuración
//! de la aplicación.

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
use crate::models::{
    ItemCategory, ItemMetadata, ModuleScanResult, ModuleStatus, ScanFilters, ScanItem,
};
use crate::scanner::check_cancelled;

// ─────────────────────────── Constantes ───────────────────────────

/// Extensiones que clasificamos como imagen.
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"];
/// Extensiones que clasificamos como vídeo.
const VIDEO_EXTS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm", "3gp"];
/// Extensiones que clasificamos como audio.
const AUDIO_EXTS: &[&str] = &["mp3", "ogg", "opus", "m4a", "wav", "aac", "wma"];
/// Extensiones que clasificamos como documento.
const DOC_EXTS: &[&str] = &["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "rar", "7z"];

/// Archivos / patrones que NUNCA se deben tocar (RF-203).
const PROTECTED_NAMES: &[&str] = &[
    // WhatsApp
    "localstorage",
    "databases",
    "indexeddb",
    "gpucache",
    // Telegram
    "key_datas",
    "settingss",
    "tdatas",
    // Genéricos
    ".db",
    ".sqlite",
    ".sqlite3",
    ".key",
    ".pem",
    ".json",
    ".cfg",
    ".ini",
    ".xml",
    ".dat",
    ".config",
];

/// Nombres de directorio protegidos (no descender).
const PROTECTED_DIRS: &[&str] = &[
    "localstorage",
    "databases",
    "indexeddb",
    "gpucache",
    "key_datas",
    "settingss",
];

// ─────────────────────────── MessagingScanner ─────────────────────

/// Scanner para cachés de WhatsApp Desktop y Telegram Desktop.
pub struct MessagingScanner;

impl MessagingScanner {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MessagingScanner {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl super::ScannerModule for MessagingScanner {
    fn module_id(&self) -> ScanModule {
        ScanModule::MessagingCache
    }

    async fn scan(
        &self,
        config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = Instant::now();

        // Reunir rutas a escanear
        let scan_roots = collect_scan_roots();
        if scan_roots.is_empty() {
            return Ok(ModuleScanResult::empty(
                &ScanModule::MessagingCache,
                ModuleStatus::Completed,
                start.elapsed().as_millis() as u64,
            ));
        }

        let mut items: Vec<ScanItem> = Vec::new();
        let mut total_size: u64 = 0;
        let mut scanned_count: u64 = 0;

        let excluded = build_exclusions(config, filters);

        for root_info in &scan_roots {
            check_cancelled(cancel)?;

            let found = scan_directory(
                &root_info.path,
                &root_info.app,
                &excluded,
                filters,
                cancel,
            )?;

            for item in found {
                scanned_count += 1;
                total_size += item.size_bytes;
                items.push(item);

                // Emitir progreso cada 50 items
                if scanned_count % 50 == 0 {
                    let _ = tx
                        .send(ScanProgress {
                            module: ScanModule::MessagingCache,
                            items_scanned: scanned_count,
                            items_found: items.len() as u64,
                            bytes_found: total_size,
                            percent: 50.0, // No podemos saber el total exacto
                            eta_seconds: None,
                        })
                        .await;
                }
            }
        }

        // Progreso final
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::MessagingCache,
                items_scanned: scanned_count,
                items_found: items.len() as u64,
                bytes_found: total_size,
                percent: 100.0,
                eta_seconds: Some(0),
            })
            .await;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(ModuleScanResult {
            module_id: ScanModule::MessagingCache.as_str().to_string(),
            status: ModuleStatus::Completed,
            duration_ms,
            items_found: items.len() as u64,
            total_size_bytes: total_size,
            items,
        })
    }
}

// ─────────────────────── Tipos auxiliares ─────────────────────────

/// Información sobre una raíz de escaneo.
struct ScanRoot {
    path: PathBuf,
    app: String,
}

// ─────────────────────── Funciones internas ───────────────────────

/// Recopila las rutas de caché de mensajería existentes en el sistema.
fn collect_scan_roots() -> Vec<ScanRoot> {
    let mut roots = Vec::new();

    if let Some(appdata) = std::env::var_os("APPDATA") {
        let appdata = PathBuf::from(appdata);

        // WhatsApp Desktop
        let wa_cache = appdata.join("WhatsApp").join("Cache");
        if wa_cache.is_dir() {
            roots.push(ScanRoot {
                path: wa_cache,
                app: "whatsapp".into(),
            });
        }
        let wa_media = appdata.join("WhatsApp").join("Media");
        if wa_media.is_dir() {
            roots.push(ScanRoot {
                path: wa_media,
                app: "whatsapp".into(),
            });
        }

        // Telegram Desktop
        let tg_tdata = appdata.join("Telegram Desktop").join("tdata");
        if tg_tdata.is_dir() {
            roots.push(ScanRoot {
                path: tg_tdata,
                app: "telegram".into(),
            });
        }
    }

    roots
}

/// Construye la lista de rutas excluidas combinando config global y filtros.
fn build_exclusions(config: &AppConfig, filters: Option<&ScanFilters>) -> Vec<String> {
    let mut excluded: Vec<String> = config.scanning.excluded_paths.clone();
    if let Some(f) = filters {
        if let Some(ref ep) = f.excluded_paths {
            excluded.extend(ep.iter().cloned());
        }
    }
    // Normalizar separadores
    excluded
        .iter()
        .map(|p| p.replace('/', "\\").to_lowercase())
        .collect()
}

/// Determina si un path está excluido por configuración.
fn is_excluded(path: &Path, exclusions: &[String]) -> bool {
    let path_lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    exclusions.iter().any(|ex| path_lower.contains(ex))
}

/// Determina si un archivo está protegido por RF-203 (no tocar).
fn is_protected(path: &Path) -> bool {
    let name_lower = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Verificar extensiones/nombres protegidos
    for prot in PROTECTED_NAMES {
        if name_lower.ends_with(prot) || name_lower == *prot {
            return true;
        }
    }

    // Verificar si algún componente del path es un directorio protegido
    for component in path.components() {
        let comp = component.as_os_str().to_string_lossy().to_lowercase();
        for dir in PROTECTED_DIRS {
            if comp == *dir {
                return true;
            }
        }
    }

    false
}

/// Categoriza un archivo por su extensión.
fn categorize_file(path: &Path) -> ItemCategory {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if IMAGE_EXTS.contains(&ext.as_str()) {
        ItemCategory::Image
    } else if VIDEO_EXTS.contains(&ext.as_str()) {
        ItemCategory::Video
    } else if AUDIO_EXTS.contains(&ext.as_str()) {
        ItemCategory::Audio
    } else if DOC_EXTS.contains(&ext.as_str()) {
        ItemCategory::Document
    } else {
        // Archivos sin extensión reconocida en caché → Cache
        ItemCategory::Cache
    }
}

/// Verifica si un item pasa los filtros de antigüedad, tamaño y categoría.
fn passes_filters(
    size: u64,
    modified: DateTime<Utc>,
    category: ItemCategory,
    filters: Option<&ScanFilters>,
) -> bool {
    let filters = match filters {
        Some(f) => f,
        None => return true,
    };

    // Filtro de antigüedad mínima
    if let Some(min_days) = filters.min_age_days {
        let age = Utc::now()
            .signed_duration_since(modified)
            .num_days()
            .max(0) as u64;
        if age < min_days {
            return false;
        }
    }

    // Filtro de tamaño máximo
    if let Some(max_bytes) = filters.max_size_bytes {
        if size > max_bytes {
            return false;
        }
    }

    // Filtro de tamaño mínimo
    if let Some(min_bytes) = filters.min_size_bytes {
        if size < min_bytes {
            return false;
        }
    }

    // Filtro de categorías
    if let Some(ref cats) = filters.categories {
        if !cats.contains(&category) {
            return false;
        }
    }

    true
}

/// Escanea recursivamente un directorio recolectando items de caché.
fn scan_directory(
    dir: &Path,
    app_source: &str,
    exclusions: &[String],
    filters: Option<&ScanFilters>,
    cancel: &AtomicBool,
) -> Result<Vec<ScanItem>> {
    let mut items = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(items), // Directorio inaccesible → omitir
    };

    for entry in entries {
        // Verificar cancelación periódicamente
        check_cancelled(cancel)?;

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Saltar exclusiones
        if is_excluded(&path, exclusions) {
            continue;
        }

        // Saltar archivos protegidos (RF-203)
        if is_protected(&path) {
            continue;
        }

        if path.is_dir() {
            // Recursión (sin entrar en directorios protegidos)
            let sub_items = scan_directory(&path, app_source, exclusions, filters, cancel)?;
            items.extend(sub_items);
        } else if path.is_file() {
            let meta = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let size = meta.len();
            let modified: DateTime<Utc> = meta
                .modified()
                .map(DateTime::<Utc>::from)
                .unwrap_or_else(|_| Utc::now());

            let category = categorize_file(&path);

            if !passes_filters(size, modified, category, filters) {
                continue;
            }

            let days_inactive = Utc::now()
                .signed_duration_since(modified)
                .num_days()
                .max(0) as u64;

            items.push(ScanItem {
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                modified_at: modified,
                category,
                metadata: ItemMetadata {
                    app_source: Some(app_source.to_string()),
                    project_name: None,
                    days_inactive: Some(days_inactive),
                    extra: HashMap::new(),
                },
            });
        }
    }

    Ok(items)
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::ScannerModule;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    /// Helper: crea una estructura de caché de WhatsApp simulada.
    fn setup_whatsapp_cache(base: &Path) -> PathBuf {
        let cache_dir = base.join("WhatsApp").join("Cache");
        fs::create_dir_all(&cache_dir).unwrap();

        // Archivos de caché legítimos
        let files = [
            ("data_0", 1024u64),
            ("data_1", 2048),
            ("data_2", 512),
            ("f_00001", 4096),
            ("f_00002", 8192),
        ];
        for (name, size) in &files {
            let path = cache_dir.join(name);
            let mut f = fs::File::create(&path).unwrap();
            f.write_all(&vec![0u8; *size as usize]).unwrap();
        }

        cache_dir
    }

    /// Helper: crea una estructura de media de WhatsApp simulada.
    fn setup_whatsapp_media(base: &Path) -> PathBuf {
        let media_dir = base.join("WhatsApp").join("Media");
        fs::create_dir_all(&media_dir).unwrap();

        // Imágenes
        let img_dir = media_dir.join("images");
        fs::create_dir_all(&img_dir).unwrap();
        fs::File::create(img_dir.join("photo1.jpg"))
            .unwrap()
            .write_all(&[0u8; 5000])
            .unwrap();
        fs::File::create(img_dir.join("photo2.png"))
            .unwrap()
            .write_all(&[0u8; 3000])
            .unwrap();

        // Vídeos
        let vid_dir = media_dir.join("videos");
        fs::create_dir_all(&vid_dir).unwrap();
        fs::File::create(vid_dir.join("video1.mp4"))
            .unwrap()
            .write_all(&[0u8; 10_000])
            .unwrap();

        // Audio
        let aud_dir = media_dir.join("audio");
        fs::create_dir_all(&aud_dir).unwrap();
        fs::File::create(aud_dir.join("voice.opus"))
            .unwrap()
            .write_all(&[0u8; 2000])
            .unwrap();

        // Documentos
        let doc_dir = media_dir.join("docs");
        fs::create_dir_all(&doc_dir).unwrap();
        fs::File::create(doc_dir.join("report.pdf"))
            .unwrap()
            .write_all(&[0u8; 7000])
            .unwrap();

        media_dir
    }

    /// Helper: crea una estructura de Telegram simulada.
    fn setup_telegram_tdata(base: &Path) -> PathBuf {
        let tdata_dir = base.join("Telegram Desktop").join("tdata");
        fs::create_dir_all(&tdata_dir).unwrap();

        // Subcarpeta de caché con contenido
        let user_data = tdata_dir.join("user_data");
        let cache_sub = user_data.join("cache");
        fs::create_dir_all(&cache_sub).unwrap();

        fs::File::create(cache_sub.join("image_cache_001.jpg"))
            .unwrap()
            .write_all(&[0u8; 6000])
            .unwrap();
        fs::File::create(cache_sub.join("sticker_001.webp"))
            .unwrap()
            .write_all(&[0u8; 1500])
            .unwrap();
        fs::File::create(cache_sub.join("video_cache.mp4"))
            .unwrap()
            .write_all(&[0u8; 15_000])
            .unwrap();

        tdata_dir
    }

    /// Helper: crea archivos protegidos que NO deben tocarse (RF-203).
    fn setup_protected_files(base: &Path) {
        let wa_dir = base.join("WhatsApp");
        fs::create_dir_all(&wa_dir).unwrap();

        // DB files
        fs::File::create(wa_dir.join("msgstore.db"))
            .unwrap()
            .write_all(&[0u8; 100])
            .unwrap();
        fs::File::create(wa_dir.join("wa.db"))
            .unwrap()
            .write_all(&[0u8; 200])
            .unwrap();
        fs::File::create(wa_dir.join("settings.json"))
            .unwrap()
            .write_all(&[0u8; 50])
            .unwrap();
        fs::File::create(wa_dir.join("encryption.key"))
            .unwrap()
            .write_all(&[0u8; 32])
            .unwrap();

        // Telegram protected
        let tg_tdata = base.join("Telegram Desktop").join("tdata");
        fs::create_dir_all(&tg_tdata).unwrap();

        let key_datas = tg_tdata.join("key_datas");
        fs::create_dir_all(&key_datas).unwrap();
        fs::File::create(key_datas.join("secret"))
            .unwrap()
            .write_all(&[0u8; 64])
            .unwrap();
    }

    // ─────────────── Test: categorización de archivos ────────────────

    #[test]
    fn test_categorize_images() {
        for ext in &["jpg", "jpeg", "png", "gif", "webp", "bmp"] {
            let path = PathBuf::from(format!("test.{ext}"));
            assert_eq!(
                categorize_file(&path),
                ItemCategory::Image,
                "Failed for .{ext}"
            );
        }
    }

    #[test]
    fn test_categorize_videos() {
        for ext in &["mp4", "mkv", "avi", "mov", "webm", "3gp"] {
            let path = PathBuf::from(format!("test.{ext}"));
            assert_eq!(
                categorize_file(&path),
                ItemCategory::Video,
                "Failed for .{ext}"
            );
        }
    }

    #[test]
    fn test_categorize_audio() {
        for ext in &["mp3", "ogg", "opus", "m4a", "wav"] {
            let path = PathBuf::from(format!("test.{ext}"));
            assert_eq!(
                categorize_file(&path),
                ItemCategory::Audio,
                "Failed for .{ext}"
            );
        }
    }

    #[test]
    fn test_categorize_documents() {
        for ext in &["pdf", "doc", "docx", "xls", "xlsx", "zip"] {
            let path = PathBuf::from(format!("test.{ext}"));
            assert_eq!(
                categorize_file(&path),
                ItemCategory::Document,
                "Failed for .{ext}"
            );
        }
    }

    #[test]
    fn test_categorize_unknown_is_cache() {
        let path = PathBuf::from("data_0");
        assert_eq!(categorize_file(&path), ItemCategory::Cache);

        let path2 = PathBuf::from("f_00001");
        assert_eq!(categorize_file(&path2), ItemCategory::Cache);
    }

    // ─────────────── Test: protección RF-203 ─────────────────────────

    #[test]
    fn test_protected_db_files() {
        assert!(is_protected(Path::new("C:\\WhatsApp\\msgstore.db")));
        assert!(is_protected(Path::new("/app/data.sqlite")));
        assert!(is_protected(Path::new("/app/data.sqlite3")));
    }

    #[test]
    fn test_protected_key_files() {
        assert!(is_protected(Path::new("C:\\WhatsApp\\secret.key")));
        assert!(is_protected(Path::new("/telegram/cert.pem")));
    }

    #[test]
    fn test_protected_config_files() {
        assert!(is_protected(Path::new("settings.json")));
        assert!(is_protected(Path::new("config.cfg")));
        assert!(is_protected(Path::new("app.ini")));
        assert!(is_protected(Path::new("manifest.xml")));
    }

    #[test]
    fn test_protected_directories() {
        assert!(is_protected(Path::new(
            "C:\\WhatsApp\\databases\\msgstore"
        )));
        assert!(is_protected(Path::new(
            "C:\\Telegram\\key_datas\\secret"
        )));
    }

    #[test]
    fn test_not_protected_cache_files() {
        assert!(!is_protected(Path::new("data_0")));
        assert!(!is_protected(Path::new("f_00001")));
        assert!(!is_protected(Path::new("photo.jpg")));
        assert!(!is_protected(Path::new("video.mp4")));
        assert!(!is_protected(Path::new("sticker.webp")));
    }

    // ─────────────── Test: filtros ────────────────────────────────────

    #[test]
    fn test_passes_filters_no_filter() {
        assert!(passes_filters(
            1000,
            Utc::now(),
            ItemCategory::Cache,
            None
        ));
    }

    #[test]
    fn test_passes_filters_max_size() {
        let filters = ScanFilters {
            max_size_bytes: Some(500),
            ..Default::default()
        };
        assert!(!passes_filters(
            1000,
            Utc::now(),
            ItemCategory::Cache,
            Some(&filters)
        ));
        assert!(passes_filters(
            400,
            Utc::now(),
            ItemCategory::Cache,
            Some(&filters)
        ));
    }

    #[test]
    fn test_passes_filters_min_size() {
        let filters = ScanFilters {
            min_size_bytes: Some(500),
            ..Default::default()
        };
        assert!(!passes_filters(
            100,
            Utc::now(),
            ItemCategory::Cache,
            Some(&filters)
        ));
        assert!(passes_filters(
            600,
            Utc::now(),
            ItemCategory::Cache,
            Some(&filters)
        ));
    }

    #[test]
    fn test_passes_filters_categories() {
        let filters = ScanFilters {
            categories: Some(vec![ItemCategory::Image, ItemCategory::Video]),
            ..Default::default()
        };
        assert!(passes_filters(
            100,
            Utc::now(),
            ItemCategory::Image,
            Some(&filters)
        ));
        assert!(!passes_filters(
            100,
            Utc::now(),
            ItemCategory::Audio,
            Some(&filters)
        ));
    }

    #[test]
    fn test_passes_filters_min_age() {
        let recent = Utc::now();
        let old = Utc::now() - chrono::Duration::days(60);

        let filters = ScanFilters {
            min_age_days: Some(30),
            ..Default::default()
        };

        assert!(!passes_filters(
            100,
            recent,
            ItemCategory::Cache,
            Some(&filters)
        ));
        assert!(passes_filters(
            100,
            old,
            ItemCategory::Cache,
            Some(&filters)
        ));
    }

    // ─────────────── Test: exclusiones ───────────────────────────────

    #[test]
    fn test_is_excluded() {
        let exclusions = vec!["\\whatsapp\\".to_string()];
        assert!(is_excluded(
            Path::new("C:\\Users\\test\\WhatsApp\\Cache"),
            &exclusions
        ));
        assert!(!is_excluded(
            Path::new("C:\\Users\\test\\Telegram\\tdata"),
            &exclusions
        ));
    }

    // ─────────────── Test: escaneo de directorio real (tempdir) ──────

    #[test]
    fn test_scan_whatsapp_cache_dir() {
        let tmp = TempDir::new().unwrap();
        let cache_dir = setup_whatsapp_cache(tmp.path());
        let cancel = AtomicBool::new(false);

        let items = scan_directory(
            &cache_dir,
            "whatsapp",
            &[],
            None,
            &cancel,
        )
        .unwrap();

        assert_eq!(items.len(), 5, "Debe encontrar 5 archivos de caché");
        for item in &items {
            assert_eq!(item.category, ItemCategory::Cache);
            assert_eq!(
                item.metadata.app_source.as_deref(),
                Some("whatsapp")
            );
        }

        let total: u64 = items.iter().map(|i| i.size_bytes).sum();
        assert_eq!(total, 1024 + 2048 + 512 + 4096 + 8192);
    }

    #[test]
    fn test_scan_whatsapp_media_categorizes() {
        let tmp = TempDir::new().unwrap();
        let media_dir = setup_whatsapp_media(tmp.path());
        let cancel = AtomicBool::new(false);

        let items = scan_directory(
            &media_dir,
            "whatsapp",
            &[],
            None,
            &cancel,
        )
        .unwrap();

        assert_eq!(items.len(), 5);

        let images: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Image).collect();
        let videos: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Video).collect();
        let audios: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Audio).collect();
        let docs: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Document).collect();

        assert_eq!(images.len(), 2, "Debe encontrar 2 imágenes");
        assert_eq!(videos.len(), 1, "Debe encontrar 1 video");
        assert_eq!(audios.len(), 1, "Debe encontrar 1 audio");
        assert_eq!(docs.len(), 1, "Debe encontrar 1 documento");
    }

    #[test]
    fn test_scan_telegram_tdata() {
        let tmp = TempDir::new().unwrap();
        let tdata_dir = setup_telegram_tdata(tmp.path());
        let cancel = AtomicBool::new(false);

        let items = scan_directory(
            &tdata_dir,
            "telegram",
            &[],
            None,
            &cancel,
        )
        .unwrap();

        assert_eq!(items.len(), 3);

        for item in &items {
            assert_eq!(
                item.metadata.app_source.as_deref(),
                Some("telegram")
            );
        }

        // Verificar categorización
        let images: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Image).collect();
        let videos: Vec<_> = items.iter().filter(|i| i.category == ItemCategory::Video).collect();
        assert_eq!(images.len(), 2, "jpg + webp = imágenes");
        assert_eq!(videos.len(), 1, "mp4 = video");
    }

    #[test]
    fn test_scan_never_touches_protected_files() {
        let tmp = TempDir::new().unwrap();
        setup_protected_files(tmp.path());

        // Crear también un archivo legítimo de caché
        let wa_cache = tmp.path().join("WhatsApp").join("Cache");
        fs::create_dir_all(&wa_cache).unwrap();
        fs::File::create(wa_cache.join("data_0"))
            .unwrap()
            .write_all(&[0u8; 100])
            .unwrap();

        let cancel = AtomicBool::new(false);

        // Escanear todo el directorio WhatsApp
        let items = scan_directory(
            &tmp.path().join("WhatsApp"),
            "whatsapp",
            &[],
            None,
            &cancel,
        )
        .unwrap();

        // Solo debe encontrar data_0, NO los archivos protegidos
        assert_eq!(items.len(), 1, "Solo debe encontrar 1 archivo de caché");
        assert!(
            items[0].path.contains("data_0"),
            "El archivo encontrado debe ser data_0"
        );

        // Verificar que NINGÚN item es un archivo protegido
        for item in &items {
            let p = Path::new(&item.path);
            assert!(
                !is_protected(p),
                "Item protegido detectado: {}",
                item.path
            );
        }
    }

    #[test]
    fn test_scan_respects_exclusions() {
        let tmp = TempDir::new().unwrap();
        setup_whatsapp_cache(tmp.path());
        setup_whatsapp_media(tmp.path());

        let cancel = AtomicBool::new(false);

        // Excluir la carpeta Media
        let media_lower = tmp
            .path()
            .join("WhatsApp")
            .join("Media")
            .to_string_lossy()
            .to_lowercase()
            .replace('/', "\\");

        let items = scan_directory(
            &tmp.path().join("WhatsApp"),
            "whatsapp",
            &[media_lower],
            None,
            &cancel,
        )
        .unwrap();

        // Solo debe encontrar archivos de Cache, no de Media
        for item in &items {
            assert!(
                !item.path.to_lowercase().contains("media"),
                "No debe incluir archivos de Media: {}",
                item.path
            );
        }
    }

    #[test]
    fn test_scan_respects_size_filter() {
        let tmp = TempDir::new().unwrap();
        setup_whatsapp_cache(tmp.path());
        let cache_dir = tmp.path().join("WhatsApp").join("Cache");
        let cancel = AtomicBool::new(false);

        let filters = ScanFilters {
            max_size_bytes: Some(1024),
            ..Default::default()
        };

        let items = scan_directory(
            &cache_dir,
            "whatsapp",
            &[],
            Some(&filters),
            &cancel,
        )
        .unwrap();

        // Solo archivos <= 1024 bytes: data_0(1024) y data_2(512)
        assert_eq!(items.len(), 2);
        for item in &items {
            assert!(
                item.size_bytes <= 1024,
                "Item demasiado grande: {} bytes",
                item.size_bytes
            );
        }
    }

    #[test]
    fn test_scan_respects_category_filter() {
        let tmp = TempDir::new().unwrap();
        setup_whatsapp_media(tmp.path());
        let media_dir = tmp.path().join("WhatsApp").join("Media");
        let cancel = AtomicBool::new(false);

        let filters = ScanFilters {
            categories: Some(vec![ItemCategory::Image]),
            ..Default::default()
        };

        let items = scan_directory(
            &media_dir,
            "whatsapp",
            &[],
            Some(&filters),
            &cancel,
        )
        .unwrap();

        // Solo imágenes (jpg + png)
        assert_eq!(items.len(), 2);
        for item in &items {
            assert_eq!(item.category, ItemCategory::Image);
        }
    }

    #[test]
    fn test_scan_cancellation() {
        let tmp = TempDir::new().unwrap();
        setup_whatsapp_cache(tmp.path());
        let cache_dir = tmp.path().join("WhatsApp").join("Cache");

        let cancel = AtomicBool::new(true); // Pre-cancelado

        let result = scan_directory(
            &cache_dir,
            "whatsapp",
            &[],
            None,
            &cancel,
        );

        assert!(result.is_err(), "Debe retornar error por cancelación");
    }

    #[test]
    fn test_scan_nonexistent_dir() {
        let cancel = AtomicBool::new(false);
        let items = scan_directory(
            Path::new("C:\\nonexistent\\path\\that\\does\\not\\exist"),
            "whatsapp",
            &[],
            None,
            &cancel,
        )
        .unwrap();

        assert!(items.is_empty(), "Directorio inexistente debe retornar vacío");
    }

    #[test]
    fn test_build_exclusions_merges() {
        let mut config = AppConfig::default();
        config.scanning.excluded_paths = vec!["C:\\skip1".to_string()];

        let filters = ScanFilters {
            excluded_paths: Some(vec!["C:\\skip2".to_string()]),
            ..Default::default()
        };

        let excl = build_exclusions(&config, Some(&filters));
        assert_eq!(excl.len(), 2);
    }

    #[test]
    fn test_messaging_scanner_module_id() {
        let scanner = MessagingScanner::new();
        assert_eq!(
            <MessagingScanner as ScannerModule>::module_id(&scanner),
            ScanModule::MessagingCache
        );
    }

    #[tokio::test]
    async fn test_messaging_scanner_scan_empty_env() {
        // Con APPDATA apuntando a un directorio vacío, no debe encontrar nada.
        // Este test verifica que el scanner no falla cuando no hay rutas de mensajería.
        let scanner = MessagingScanner::new();
        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        // El scan real depende de APPDATA del sistema; como es test unitario
        // validamos la estructura del resultado (puede ser vacío o con datos reales).
        let result = <MessagingScanner as ScannerModule>::scan(
            &scanner,
            &config,
            &cancel,
            &tx,
            None,
        )
        .await
        .unwrap();

        assert_eq!(result.module_id, "messaging_cache");
        assert!(
            result.status == ModuleStatus::Completed,
            "Status debe ser Completed"
        );
    }
}
