//! # GigaCare Core
//!
//! Orquestador principal del sistema de optimización GigaCare.
//!
//! Coordina los módulos de escaneo, cuarentena, configuración,
//! análisis de fotos con IA, y vista previa de limpieza.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use base64::prelude::*;
use chrono::Utc;
use uuid::Uuid;

pub mod error;
pub mod events;
pub mod models;
pub mod scanner;

// Re-exports de conveniencia
pub use error::{CoreError, Result};
pub use events::{AiAnalysisProgress, CleanProgress, ScanModule, ScanProgress};
pub use models::{
    CategorySummary, CleanError, CleanResult, ItemCategory, ItemMetadata, ModuleScanResult,
    PhotoAiAnalysis, PhotoGroup, PhotoItem, Platform, PreviewResult, ScanFilters, ScanItem,
    ScanResult,
};
pub use scanner::Scanner;

// ─────────────────────────── Funciones de integración (T022) ──────

/// Genera un resumen de vista previa sin mover ningún archivo.
pub fn preview_clean(items: &[ScanItem]) -> PreviewResult {
    let mut total_bytes = 0u64;
    let mut by_category: HashMap<String, CategorySummary> = HashMap::new();
    let mut modules_set = std::collections::HashSet::new();

    for item in items {
        total_bytes += item.size_bytes;
        let cat_key = item.category.to_string();

        let entry = by_category.entry(cat_key).or_insert(CategorySummary {
            count: 0,
            total_bytes: 0,
        });
        entry.count += 1;
        entry.total_bytes += item.size_bytes;

        if let Some(ref source) = item.metadata.app_source {
            modules_set.insert(source.clone());
        }
    }

    PreviewResult {
        modules: modules_set.into_iter().collect(),
        total_items: items.len() as u64,
        total_bytes,
        by_category,
    }
}

/// Mueve los elementos seleccionados hacia la cuarentena reversible.
pub async fn clean_items(
    scan_id: &str,
    items: &[ScanItem],
    quarantine: &mut gigacare_quarantine::QuarantineManager,
    tx: Option<&tokio::sync::mpsc::Sender<CleanProgress>>,
    cancel: Option<&AtomicBool>,
) -> Result<CleanResult> {
    let mut items_moved = 0u64;
    let mut items_failed = 0u64;
    let mut bytes_freed = 0u64;
    let mut errors = Vec::new();
    let total = items.len() as u64;

    for (_idx, item) in items.iter().enumerate() {
        if let Some(c) = cancel {
            if c.load(Ordering::Relaxed) {
                break;
            }
        }

        let p = Path::new(&item.path);
        let module_str = item
            .metadata
            .app_source
            .clone()
            .unwrap_or_else(|| item.category.to_string());

        match quarantine.quarantine_file(p, &module_str) {
            Ok(_) => {
                items_moved += 1;
                bytes_freed += item.size_bytes;
            }
            Err(e) => {
                items_failed += 1;
                errors.push(CleanError {
                    path: item.path.clone(),
                    reason: e.to_string(),
                });
            }
        }

        if let Some(sender) = tx {
            let _ = sender
                .send(CleanProgress {
                    items_total: total,
                    items_moved,
                    bytes_freed,
                    current_file: item.path.clone(),
                })
                .await;
        }
    }

    Ok(CleanResult {
        scan_id: scan_id.to_string(),
        timestamp: Utc::now(),
        items_moved,
        items_failed,
        bytes_freed,
        errors,
    })
}

/// Agrupa imágenes por similitud perceptual usando pHash y distancia de Hamming.
pub fn find_photo_groups(photo_paths: &[PathBuf], max_hamming_distance: u32) -> Result<Vec<PhotoGroup>> {
    struct ImgMeta {
        path: PathBuf,
        size_bytes: u64,
        resolution: String,
        phash: String,
        phash_u64: u64,
    }

    let mut metas = Vec::new();

    for p in photo_paths {
        if !p.is_file() {
            continue;
        }
        let size_bytes = p.metadata().map(|m| m.len()).unwrap_or(0);
        let per_hash = match gigacare_hash::perceptual_hash(p) {
            Ok(h) => h,
            Err(_) => continue,
        };

        let phash_u64 = per_hash.phash;
        let phash_hex = format!("{:016x}", phash_u64);

        let resolution = if let Ok((w, h)) = image::image_dimensions(p) {
            format!("{}x{}", w, h)
        } else {
            "unknown".to_string()
        };

        metas.push(ImgMeta {
            path: p.clone(),
            size_bytes,
            resolution,
            phash: phash_hex,
            phash_u64,
        });
    }

    let mut visited = vec![false; metas.len()];
    let mut groups = Vec::new();

    for i in 0..metas.len() {
        if visited[i] {
            continue;
        }

        let mut cluster_indices = vec![i];
        visited[i] = true;

        for j in (i + 1)..metas.len() {
            if visited[j] {
                continue;
            }
            let dist = gigacare_hash::hamming_distance(metas[i].phash_u64, metas[j].phash_u64);
            if dist <= max_hamming_distance {
                visited[j] = true;
                cluster_indices.push(j);
            }
        }

        if cluster_indices.len() > 1 {
            let mut photos = Vec::new();
            let mut total_dist = 0u32;
            let mut pairs = 0u32;

            for (ci_idx, &ci) in cluster_indices.iter().enumerate() {
                for &cj in &cluster_indices[(ci_idx + 1)..] {
                    total_dist += gigacare_hash::hamming_distance(metas[ci].phash_u64, metas[cj].phash_u64);
                    pairs += 1;
                }
                photos.push(PhotoItem {
                    path: metas[ci].path.to_string_lossy().to_string(),
                    original_resolution: metas[ci].resolution.clone(),
                    size_bytes: metas[ci].size_bytes,
                    phash: metas[ci].phash.clone(),
                    thumbnail_path: None,
                    ai_analysis: None,
                });
            }

            let avg_dist = if pairs > 0 { total_dist / pairs } else { 0 };

            groups.push(PhotoGroup {
                group_id: Uuid::new_v4().to_string(),
                similarity_method: "phash".to_string(),
                avg_hamming_distance: avg_dist,
                photos,
            });
        }
    }

    Ok(groups)
}

/// Analiza un grupo de fotos usando visión (generación de miniaturas) y el router de IA.
pub async fn analyze_group_ai(
    group: &mut PhotoGroup,
    router: &gigacare_ai::AiRouter,
    keep_count: usize,
) -> Result<()> {
    let mut base64_thumbs = Vec::new();

    for photo in &group.photos {
        let p = Path::new(&photo.path);
        let dynamic_img = image::open(p).map_err(|e| CoreError::Other(e.to_string()))?;
        let thumb_bytes = gigacare_vision::generate_thumbnail_bytes(&dynamic_img)
            .map_err(|e| CoreError::Other(e.to_string()))?;
        let b64 = BASE64_STANDARD.encode(&thumb_bytes);
        base64_thumbs.push(b64);
    }

    let ai_result = router.analyze_group(&base64_thumbs, keep_count).await;

    for (idx, photo) in group.photos.iter_mut().enumerate() {
        if let Some(score) = ai_result.analysis.iter().find(|s| s.photo_index == idx) {
            let is_keep = ai_result.recommended_keep.contains(&idx);
            photo.ai_analysis = Some(PhotoAiAnalysis {
                provider_used: ai_result.provider_used.to_string(),
                sharpness_score: score.sharpness,
                eyes_open_score: score.eyes_open,
                composition_score: score.composition,
                noise_score: score.noise_absence,
                total_score: score.total_weighted,
                rank: if is_keep { 1 } else { 2 },
                recommendation: if is_keep { "keep".into() } else { "discard".into() },
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_full_lifecycle_scan_preview_clean_quarantine_restore() {
        let tmp = tempdir().unwrap();
        let work_dir = tmp.path().join("work");
        let q_dir = tmp.path().join("quarantine");
        fs::create_dir_all(&work_dir).unwrap();

        // 1. Crear 3 archivos de prueba simulando resultados de escaneo
        let f1 = work_dir.join("temp1.tmp");
        let f2 = work_dir.join("temp2.tmp");
        let f3 = work_dir.join("cache.dat");

        fs::write(&f1, b"archivo temporal uno").unwrap();
        fs::write(&f2, b"archivo temporal dos").unwrap();
        fs::write(&f3, b"datos de cache tres").unwrap();

        let sha1 = gigacare_hash::sha256_file(&f1).unwrap();
        let sha2 = gigacare_hash::sha256_file(&f2).unwrap();
        let sha3 = gigacare_hash::sha256_file(&f3).unwrap();

        let items = vec![
            ScanItem {
                path: f1.to_string_lossy().to_string(),
                size_bytes: f1.metadata().unwrap().len(),
                modified_at: Utc::now(),
                category: ItemCategory::Temp,
                metadata: ItemMetadata::default(),
            },
            ScanItem {
                path: f2.to_string_lossy().to_string(),
                size_bytes: f2.metadata().unwrap().len(),
                modified_at: Utc::now(),
                category: ItemCategory::Temp,
                metadata: ItemMetadata::default(),
            },
            ScanItem {
                path: f3.to_string_lossy().to_string(),
                size_bytes: f3.metadata().unwrap().len(),
                modified_at: Utc::now(),
                category: ItemCategory::Cache,
                metadata: ItemMetadata::default(),
            },
        ];

        // 2. Previsualizar (preview_clean)
        let preview = preview_clean(&items);
        assert_eq!(preview.total_items, 3);
        assert_eq!(preview.total_bytes, items.iter().map(|i| i.size_bytes).sum::<u64>());
        assert_eq!(preview.by_category.get("temp").unwrap().count, 2);
        assert_eq!(preview.by_category.get("cache").unwrap().count, 1);

        // Los archivos originales aún deben existir intactos
        assert!(f1.exists());
        assert!(f2.exists());
        assert!(f3.exists());

        // 3. Confirmar y limpiar hacia cuarentena (clean_items)
        let mut q_manager = gigacare_quarantine::QuarantineManager::with_defaults(q_dir).unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::channel(16);

        let clean_res = clean_items("scan-123", &items, &mut q_manager, Some(&tx), None)
            .await
            .unwrap();

        assert_eq!(clean_res.items_moved, 3);
        assert_eq!(clean_res.items_failed, 0);
        assert_eq!(clean_res.bytes_freed, preview.total_bytes);

        // Verificar que los archivos físicos originales ya no existen
        assert!(!f1.exists());
        assert!(!f2.exists());
        assert!(!f3.exists());

        // Verificar eventos emitidos
        let mut progress_count = 0;
        while let Ok(_ev) = rx.try_recv() {
            progress_count += 1;
        }
        assert!(progress_count >= 3);

        // 4. Restaurar archivos desde la cuarentena y verificar integridad binaria (SHA-256)
        let q_entries = q_manager.list_entries(None);
        assert_eq!(q_entries.len(), 3);

        for entry in &q_entries {
            let restored = q_manager.restore_file(&entry.id).unwrap();
            assert!(restored.exists());
        }

        assert_eq!(gigacare_hash::sha256_file(&f1).unwrap(), sha1);
        assert_eq!(gigacare_hash::sha256_file(&f2).unwrap(), sha2);
        assert_eq!(gigacare_hash::sha256_file(&f3).unwrap(), sha3);
    }

    #[test]
    fn test_find_photo_groups_clustering() {
        let tmp = tempdir().unwrap();
        let p1 = tmp.path().join("img1.png");
        let p2 = tmp.path().join("img2.png");
        let p3 = tmp.path().join("diff.png");

        // Crear 2 imágenes idénticas (pHash idéntico)
        let img_a = image::GrayImage::new(64, 64);
        img_a.save(&p1).unwrap();
        img_a.save(&p2).unwrap();

        // Crear una imagen con patrón muy distinto
        let mut img_b = image::GrayImage::new(64, 64);
        for y in 0..64 {
            for x in 0..64 {
                if (x + y) % 2 == 0 {
                    img_b.put_pixel(x, y, image::Luma([255]));
                }
            }
        }
        img_b.save(&p3).unwrap();

        let groups = find_photo_groups(&[p1, p2, p3], 8).unwrap();
        assert_eq!(groups.len(), 1, "Debe agrupar las 2 imágenes similares");
        assert_eq!(groups[0].photos.len(), 2);
    }

    #[tokio::test]
    async fn test_analyze_group_ai_integration() {
        let tmp = tempdir().unwrap();
        let p1 = tmp.path().join("photo_a.jpg");
        let p2 = tmp.path().join("photo_b.jpg");

        let img = image::DynamicImage::ImageLuma8(image::GrayImage::new(100, 100));
        img.save(&p1).unwrap();
        img.save(&p2).unwrap();

        let mut group = PhotoGroup {
            group_id: "test-group".into(),
            similarity_method: "phash".into(),
            avg_hamming_distance: 0,
            photos: vec![
                PhotoItem {
                    path: p1.to_string_lossy().to_string(),
                    original_resolution: "100x100".into(),
                    size_bytes: 1000,
                    phash: "123".into(),
                    thumbnail_path: None,
                    ai_analysis: None,
                },
                PhotoItem {
                    path: p2.to_string_lossy().to_string(),
                    original_resolution: "100x100".into(),
                    size_bytes: 1000,
                    phash: "123".into(),
                    thumbnail_path: None,
                    ai_analysis: None,
                },
            ],
        };

        // Router sin proveedores externos -> activa fallback local
        let router = gigacare_ai::AiRouter::new(vec![], 10, 30);
        analyze_group_ai(&mut group, &router, 1).await.unwrap();

        assert!(group.photos[0].ai_analysis.is_some());
        assert!(group.photos[1].ai_analysis.is_some());
        assert_eq!(
            group.photos[0].ai_analysis.as_ref().unwrap().provider_used,
            "local_fallback"
        );
    }
}
