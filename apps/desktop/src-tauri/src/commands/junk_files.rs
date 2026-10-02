use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use jwalk::WalkDir;

use gigacare_core::events::CleanProgress;
use gigacare_core::models::{CleanError, CleanResult, ScanFilters};
use gigacare_core::scanner::browsers::{self, BrowserCacheProfile};
use gigacare_core::scanner::junk_files::{JunkFilesScanResult, JunkFilesScanner};
use crate::AppState;

/// Escanea todas las categorías de archivos basura emitiendo eventos `scan-progress`.
#[tauri::command]
pub async fn scan_junk_files(
    app: AppHandle,
    state: State<'_, AppState>,
    filters: Option<ScanFilters>,
) -> Result<JunkFilesScanResult, String> {
    state.cancel_flag.store(false, Ordering::Relaxed);
    let config = state.config.lock().await.clone();
    let (tx, mut rx) = tokio::sync::mpsc::channel(64);

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_handle.emit("scan-progress", progress);
        }
    });

    let mut scan_result = JunkFilesScanner::scan(&config, &state.cancel_flag, &tx, filters.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    // Integrar Papelera de Reciclaje
    let rb_result = crate::commands::recycle_bin::scan_recycle_bin(Some("C:".to_string()));
    let rb_items: Vec<gigacare_core::scanner::junk_files::JunkItem> = rb_result.items.iter().map(|item| {
        gigacare_core::scanner::junk_files::JunkItem {
            id: item.recycle_path.clone().unwrap_or_else(|| item.original_path.clone()),
            display_name: item.name.clone(),
            path: item.recycle_path.clone().unwrap_or_else(|| item.original_path.clone()),
            size_bytes: item.size_bytes,
            safe: true,
            age_days: None,
            age_display: Some(item.deleted_at.clone()),
            source_type: Some("recycle_bin".to_string()),
        }
    }).collect();

    let rb_safe: u64 = rb_items.iter().map(|i| i.size_bytes).sum();
    let rb_total = if rb_result.total_bytes > 0 { rb_result.total_bytes } else { rb_safe };

    scan_result.categories.push(gigacare_core::scanner::junk_files::JunkCategory {
        category_id: "recycle_bin".to_string(),
        display_name: "Papelera de Reciclaje".to_string(),
        total_bytes: rb_total,
        safe_bytes: rb_safe,
        items: rb_items,
        informational: None,
    });
    scan_result.total_junk_bytes += rb_total;

    Ok(scan_result)
}

/// Escanea exclusivamente las cachés de navegadores web.
#[tauri::command]
pub fn scan_browser_caches() -> Result<Vec<BrowserCacheProfile>, String> {
    Ok(browsers::scan_browser_caches())
}

/// Limpia todas las cachés de un navegador específico enviándolas a cuarentena.
///
/// Si un archivo está bloqueado por el navegador en ejecución, se omite silenciosamente
/// y se registra en `errors` con indicación de cerrar el navegador.
#[tauri::command]
pub async fn clean_browser_cache(
    app: AppHandle,
    state: State<'_, AppState>,
    browser_id: String,
) -> Result<CleanResult, String> {
    let mut q_manager = state.quarantine.lock().await;
    let (tx, mut rx) = tokio::sync::mpsc::channel(32);

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_handle.emit("clean-progress", progress);
        }
    });

    // Obtener los perfiles del navegador solicitado
    let all_browsers = browsers::scan_browser_caches();
    let target_browser = all_browsers
        .into_iter()
        .find(|b| b.browser_id.to_lowercase() == browser_id.to_lowercase());

    let target = match target_browser {
        Some(b) if b.installed => b,
        _ => {
            return Ok(CleanResult {
                scan_id: format!("browser-clean-{}", browser_id),
                timestamp: chrono::Utc::now(),
                items_moved: 0,
                items_failed: 0,
                bytes_freed: 0,
                errors: vec![],
            });
        }
    };

    // Recolectar todos los archivos dentro de las rutas de caché del navegador
    let mut files_to_clean: Vec<(PathBuf, u64)> = Vec::new();
    for profile in &target.profiles {
        for entry in &profile.cache_entries {
            let entry_path = Path::new(&entry.path);
            if !entry_path.exists() {
                continue;
            }
            if entry_path.is_file() {
                files_to_clean.push((entry_path.to_path_buf(), entry.size_bytes));
            } else if entry_path.is_dir() {
                for dir_entry in WalkDir::new(entry_path).into_iter().flatten() {
                    let p = dir_entry.path();
                    if p.is_file() {
                        let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                        files_to_clean.push((p.to_path_buf(), size));
                    }
                }
            }
        }
    }

    let total_files = files_to_clean.len() as u64;
    let mut items_moved = 0u64;
    let mut items_failed = 0u64;
    let mut bytes_freed = 0u64;
    let mut errors = Vec::new();

    for (path, size) in files_to_clean {
        if state.cancel_flag.load(Ordering::Relaxed) {
            break;
        }

        let path_str = path.to_string_lossy().to_string();
        let source = format!("browser_cache_{}", browser_id);

        match q_manager.quarantine_file(&path, &source) {
            Ok(_) => {
                items_moved += 1;
                bytes_freed += size;
            }
            Err(e) => {
                items_failed += 1;
                let reason = format!(
                    "Archivo bloqueado o sin permisos: {}. Cierra {} e intenta de nuevo.",
                    e, target.browser_name
                );
                errors.push(CleanError {
                    path: path_str.clone(),
                    reason,
                });
            }
        }

        let _ = tx
            .send(CleanProgress {
                items_total: total_files,
                items_moved,
                bytes_freed,
                current_file: path_str,
            })
            .await;
    }

    Ok(CleanResult {
        scan_id: format!("browser-clean-{}", browser_id),
        timestamp: chrono::Utc::now(),
        items_moved,
        items_failed,
        bytes_freed,
        errors,
    })
}
