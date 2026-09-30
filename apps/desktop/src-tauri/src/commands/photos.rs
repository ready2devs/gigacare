use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use gigacare_core::models::PhotoGroup;
use gigacare_core::hasher::{default_cache_path, find_similar_groups, hash_image_file, load_cache_from, save_cache_to};
use crate::AppState;

#[tauri::command(rename_all = "snake_case")]
pub async fn find_photo_groups(
    state: State<'_, AppState>,
    folder_path: Option<String>,
) -> Result<Vec<PhotoGroup>, String> {
    let cfg = state.config.lock().await;
    let user_pictures = folder_path
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::picture_dir().unwrap_or_else(|| PathBuf::from(".")));
    
    let mut paths = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&user_pictures) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let ext = ext.to_lowercase();
                if ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" {
                    paths.push(p);
                }
            }
        }
    }

    if paths.is_empty() {
        return Ok(Vec::new());
    }

    // Utilizar caché persistente en .gigacare/cache/image_hashes.bin y BK-Tree + UnionFind
    let cache_path = default_cache_path();
    let mut cache = load_cache_from(&cache_path);
    let mut hash_entries = Vec::new();

    for p in &paths {
        if let Ok(entry) = hash_image_file(p, &mut cache) {
            hash_entries.push(entry);
        }
    }

    let _ = save_cache_to(&cache, &cache_path);

    let threshold = cfg.photos.phash_threshold.max(1);
    let groups = find_similar_groups(&hash_entries, threshold);

    // Guardar en caché en memoria de la app
    let mut cached = state.cached_photo_groups.lock().await;
    *cached = groups.clone();

    Ok(groups)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn analyze_group_ai(
    app: AppHandle,
    state: State<'_, AppState>,
    group_id: String,
    keep_count: Option<u32>,
) -> Result<PhotoGroup, String> {
    let kc = {
        let cfg = state.config.lock().await;
        let raw = keep_count.unwrap_or(cfg.photos.keep_count);
        raw.clamp(1, 3) as usize
    };

    let mut groups = state.cached_photo_groups.lock().await;
    let group = groups.iter_mut().find(|g| g.group_id == group_id)
        .ok_or_else(|| format!("Grupo {} no encontrado", group_id))?;

    let router = gigacare_ai::AiRouter::new(vec![], 10, 30);
    gigacare_core::analyze_group_ai(group, &router, kc)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("ai-analysis-progress", gigacare_core::events::AiAnalysisProgress {
        groups_analyzed: 1,
        groups_total: 1,
        current_provider: "local_fallback".into(),
        current_group_id: group_id,
    });

    Ok(group.clone())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn analyze_all_groups_ai(
    app: AppHandle,
    state: State<'_, AppState>,
    keep_count: Option<u32>,
) -> Result<Vec<PhotoGroup>, String> {
    let kc = {
        let cfg = state.config.lock().await;
        let raw = keep_count.unwrap_or(cfg.photos.keep_count);
        raw.clamp(1, 3) as usize
    };

    let mut groups = state.cached_photo_groups.lock().await;
    let total = groups.len() as u64;
    let router = gigacare_ai::AiRouter::new(vec![], 10, 30);

    for (idx, group) in groups.iter_mut().enumerate() {
        let _ = gigacare_core::analyze_group_ai(group, &router, kc).await;
        let _ = app.emit("ai-analysis-progress", gigacare_core::events::AiAnalysisProgress {
            groups_analyzed: (idx + 1) as u64,
            groups_total: total,
            current_provider: "local_fallback".into(),
            current_group_id: group.group_id.clone(),
        });
    }

    Ok(groups.clone())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct RecursivePhotoScanResult {
    pub groups: Vec<PhotoGroup>,
    pub total_photos_found: usize,
    pub photos_processed: usize,
    pub truncated: bool,
    pub scan_path: String,
}

const EXCLUDED_DIRS: &[&str] = &[
    "$Recycle.Bin",
    "System Volume Information",
    "Windows",
    "Program Files",
    "Program Files (x86)",
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "target",
    "AppData",
];

const SUPPORTED_IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "bmp", "heic", "heif", "tiff",
];

pub fn is_excluded_dir(name: &str) -> bool {
    EXCLUDED_DIRS.iter().any(|&excl| name.eq_ignore_ascii_case(excl))
}

pub fn has_excluded_component(root: &std::path::Path, full_path: &std::path::Path) -> bool {
    let rel = full_path.strip_prefix(root).unwrap_or(full_path);
    for comp in rel.components() {
        if let std::path::Component::Normal(os_str) = comp {
            if let Some(name) = os_str.to_str() {
                if is_excluded_dir(name) {
                    return true;
                }
            }
        }
    }
    false
}

pub fn scan_folder_recursive_with_limit(
    folder: &std::path::Path,
    soft_limit: usize,
    threshold: u32,
) -> Result<RecursivePhotoScanResult, String> {
    if !folder.exists() {
        return Err(format!("La carpeta no existe: {}", folder.display()));
    }
    // Check read permission on root folder
    std::fs::read_dir(folder)
        .map_err(|_| "No tienes permisos para acceder a esta carpeta.".to_string())?;

    let mut all_photo_paths: Vec<PathBuf> = Vec::new();

    for entry in jwalk::WalkDir::new(folder).skip_hidden(false).into_iter().flatten() {
        let p = entry.path();
        if has_excluded_component(folder, &p) {
            continue;
        }
        if p.is_file() {
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if SUPPORTED_IMAGE_EXTS.contains(&ext_lower.as_str()) {
                    all_photo_paths.push(p);
                }
            }
        }
    }

    let total_photos_found = all_photo_paths.len();
    let truncated = total_photos_found > soft_limit;
    let to_process = if truncated {
        &all_photo_paths[..soft_limit]
    } else {
        &all_photo_paths[..]
    };

    let photos_processed = to_process.len();

    if photos_processed == 0 {
        return Ok(RecursivePhotoScanResult {
            groups: Vec::new(),
            total_photos_found: 0,
            photos_processed: 0,
            truncated: false,
            scan_path: folder.to_string_lossy().to_string(),
        });
    }

    let cache_path = default_cache_path();
    let mut cache = load_cache_from(&cache_path);
    let mut hash_entries = Vec::new();

    for p in to_process {
        if let Ok(entry) = hash_image_file(p, &mut cache) {
            hash_entries.push(entry);
        }
    }

    let _ = save_cache_to(&cache, &cache_path);

    let groups = find_similar_groups(&hash_entries, threshold.max(1));

    Ok(RecursivePhotoScanResult {
        groups,
        total_photos_found,
        photos_processed,
        truncated,
        scan_path: folder.to_string_lossy().to_string(),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn find_photo_groups_recursive(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<RecursivePhotoScanResult, String> {
    let threshold = {
        let cfg = state.config.lock().await;
        cfg.photos.phash_threshold.max(1)
    };

    let folder = PathBuf::from(&folder_path);
    let res = scan_folder_recursive_with_limit(&folder, 5000, threshold)?;

    let mut cached = state.cached_photo_groups.lock().await;
    *cached = res.groups.clone();

    Ok(res)
}

#[cfg(test)]
mod tests {
    use gigacare_core::models::{PhotoGroup, PhotoItem};
    use tempfile::tempdir;

    fn make_photo_item(path: &str) -> PhotoItem {
        PhotoItem {
            path: path.to_string(),
            original_resolution: "32x32".into(),
            size_bytes: 1024,
            phash: "aabbccdd".into(),
            thumbnail_path: None,
            ai_analysis: None,
        }
    }

    fn create_test_png(path: &std::path::Path) {
        let img = image::RgbImage::new(32, 32);
        image::DynamicImage::ImageRgb8(img).save(path).unwrap();
    }

    #[tokio::test]
    async fn test_analyze_groups_respects_keep_count() {
        let tmp = tempdir().unwrap();
        let p1 = tmp.path().join("photo1.png");
        let p2 = tmp.path().join("photo2.png");
        let p3 = tmp.path().join("photo3.png");
        let p4 = tmp.path().join("photo4.png");

        create_test_png(&p1);
        create_test_png(&p2);
        create_test_png(&p3);
        create_test_png(&p4);

        // ── Test con keep_count = 2 ──
        let mut group = PhotoGroup {
            group_id: "test-group-kc2".into(),
            similarity_method: "phash".into(),
            avg_hamming_distance: 0,
            photos: vec![
                make_photo_item(&p1.to_string_lossy()),
                make_photo_item(&p2.to_string_lossy()),
                make_photo_item(&p3.to_string_lossy()),
                make_photo_item(&p4.to_string_lossy()),
            ],
        };

        let kc = 2u32.clamp(1, 3) as usize;
        let router = gigacare_ai::AiRouter::new(vec![], 10, 30);
        gigacare_core::analyze_group_ai(&mut group, &router, kc).await.unwrap();

        let keep_count = group.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "keep").unwrap_or(false))
            .count();
        let discard_count = group.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "discard").unwrap_or(false))
            .count();

        assert_eq!(keep_count, 2, "Con keep_count=2 deben marcarse 2 fotos como keep");
        assert_eq!(discard_count, 2, "Con keep_count=2 deben marcarse 2 fotos como discard");

        // ── Test con keep_count = 3 ──
        let mut group3 = PhotoGroup {
            group_id: "test-group-kc3".into(),
            similarity_method: "phash".into(),
            avg_hamming_distance: 0,
            photos: vec![
                make_photo_item(&p1.to_string_lossy()),
                make_photo_item(&p2.to_string_lossy()),
                make_photo_item(&p3.to_string_lossy()),
                make_photo_item(&p4.to_string_lossy()),
            ],
        };

        let kc3 = 3u32.clamp(1, 3) as usize;
        gigacare_core::analyze_group_ai(&mut group3, &router, kc3).await.unwrap();

        let keep_count3 = group3.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "keep").unwrap_or(false))
            .count();
        let discard_count3 = group3.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "discard").unwrap_or(false))
            .count();

        assert_eq!(keep_count3, 3, "Con keep_count=3 deben marcarse 3 fotos como keep");
        assert_eq!(discard_count3, 1, "Con keep_count=3 debe marcarse 1 foto como discard");
    }

    #[tokio::test]
    async fn test_keep_count_clamp_to_group_size() {
        let tmp = tempdir().unwrap();
        let p1 = tmp.path().join("photoA.png");
        let p2 = tmp.path().join("photoB.png");

        create_test_png(&p1);
        create_test_png(&p2);

        // Grupo de 2 fotos con keep_count = 3 (mayor que el grupo)
        let mut group = PhotoGroup {
            group_id: "test-group-clamp".into(),
            similarity_method: "phash".into(),
            avg_hamming_distance: 0,
            photos: vec![
                make_photo_item(&p1.to_string_lossy()),
                make_photo_item(&p2.to_string_lossy()),
            ],
        };

        let kc = 3u32.clamp(1, 3) as usize; // = 3, mayor que el grupo de 2
        let router = gigacare_ai::AiRouter::new(vec![], 10, 30);
        gigacare_core::analyze_group_ai(&mut group, &router, kc).await.unwrap();

        let keep_count = group.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "keep").unwrap_or(false))
            .count();
        let discard_count = group.photos.iter()
            .filter(|p| p.ai_analysis.as_ref().map(|a| a.recommendation == "discard").unwrap_or(false))
            .count();

        // Cuando keep_count (3) >= group size (2), todas deben ser "keep"
        assert_eq!(keep_count, 2, "Cuando keep_count >= tamaño del grupo, todas deben ser keep");
        assert_eq!(discard_count, 0, "No debe haber fotos descartadas cuando keep_count >= tamaño del grupo");
    }

    #[test]
    fn test_recursive_scan_excludes_system_dirs() {
        let tmp = tempdir().unwrap();
        let node_mods = tmp.path().join("node_modules");
        let normal_dir = tmp.path().join("vacaciones");
        std::fs::create_dir_all(&node_mods).unwrap();
        std::fs::create_dir_all(&normal_dir).unwrap();

        // Fotos en node_modules (deben ser excluidas)
        create_test_png(&node_mods.join("excluded1.png"));
        create_test_png(&node_mods.join("excluded2.png"));

        // Fotos en carpeta normal (deben ser procesadas)
        create_test_png(&normal_dir.join("valid1.png"));
        create_test_png(&normal_dir.join("valid2.png"));

        let res = super::scan_folder_recursive_with_limit(tmp.path(), 5000, 10).unwrap();
        assert_eq!(res.total_photos_found, 2, "Solo debe encontrar las 2 fotos fuera de node_modules");
        assert_eq!(res.photos_processed, 2);
        assert!(!res.truncated);
    }

    #[test]
    fn test_recursive_scan_soft_limit() {
        let tmp = tempdir().unwrap();
        for i in 1..=6 {
            create_test_png(&tmp.path().join(format!("img_{}.png", i)));
        }

        let res = super::scan_folder_recursive_with_limit(tmp.path(), 3, 10).unwrap();
        assert_eq!(res.total_photos_found, 6);
        assert_eq!(res.photos_processed, 3);
        assert!(res.truncated, "truncated debe ser true cuando total_photos_found > soft_limit");
    }
}
