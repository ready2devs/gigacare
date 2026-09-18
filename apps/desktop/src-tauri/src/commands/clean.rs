use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use gigacare_core::models::{CleanResult, ItemCategory, ItemMetadata, PreviewResult, ScanItem};
use crate::AppState;

#[tauri::command]
pub async fn clean_items(
    app: AppHandle,
    state: State<'_, AppState>,
    item_ids: Vec<String>,
) -> Result<CleanResult, String> {
    let mut q_manager = state.quarantine.lock().await;
    let (tx, mut rx) = tokio::sync::mpsc::channel(32);

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_handle.emit("clean-progress", progress);
        }
    });

    let items: Vec<ScanItem> = item_ids
        .into_iter()
        .map(|path_str| {
            let size = Path::new(&path_str).metadata().map(|m| m.len()).unwrap_or(0);
            ScanItem {
                path: path_str,
                size_bytes: size,
                modified_at: chrono::Utc::now(),
                category: ItemCategory::Temp,
                metadata: ItemMetadata::default(),
            }
        })
        .collect();

    gigacare_core::clean_items("ipc-clean", &items, &mut q_manager, Some(&tx), Some(&state.cancel_flag))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_clean(item_ids: Vec<String>) -> PreviewResult {
    let items: Vec<ScanItem> = item_ids
        .into_iter()
        .map(|path_str| {
            let size = Path::new(&path_str).metadata().map(|m| m.len()).unwrap_or(0);
            ScanItem {
                path: path_str,
                size_bytes: size,
                modified_at: chrono::Utc::now(),
                category: ItemCategory::Temp,
                metadata: ItemMetadata::default(),
            }
        })
        .collect();

    gigacare_core::preview_clean(&items)
}
