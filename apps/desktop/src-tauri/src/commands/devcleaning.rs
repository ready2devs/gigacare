use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use gigacare_devcleaning::{
    scan_dev_caches, scan_ml_models, scan_python_envs,
    DevCleanOutcome, DevCleanReport, MlModelReport, PyReport,
};
use crate::AppState;

#[tauri::command]
pub async fn dev_clean_scan() -> Result<DevCleanReport, String> {
    tokio::task::spawn_blocking(scan_dev_caches)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ml_model_scan() -> Result<MlModelReport, String> {
    tokio::task::spawn_blocking(scan_ml_models)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn python_env_scan() -> Result<PyReport, String> {
    tokio::task::spawn_blocking(scan_python_envs)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dev_clean_remove(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<DevCleanOutcome, String> {
    let mut q_manager = state.quarantine.lock().await;
    let mut freed_bytes = 0u64;
    let mut quarantined_count = 0u64;
    let mut errors = Vec::new();

    for path_str in paths {
        let p = Path::new(&path_str);
        if !p.exists() {
            errors.push(format!("File or directory not found: {}", path_str));
            continue;
        }

        // Medir tamaño antes de mover
        let mut size = 0u64;
        if p.is_file() {
            size = p.metadata().map(|m| m.len()).unwrap_or(0);
        } else if p.is_dir() {
            for entry in jwalk::WalkDir::new(p).skip_hidden(false) {
                if let Ok(e) = entry {
                    if let Ok(meta) = e.metadata() {
                        if meta.is_file() {
                            size += meta.len();
                        }
                    }
                }
            }
        }

        match q_manager.quarantine_path(p, "dev_cleaning") {
            Ok(_) => {
                freed_bytes += size;
                quarantined_count += 1;
            }
            Err(e) => {
                errors.push(format!("{}: {}", path_str, e));
            }
        }
    }

    Ok(DevCleanOutcome {
        freed_bytes,
        quarantined_count,
        errors,
    })
}

#[tauri::command]
pub async fn dev_clean_reveal(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}
