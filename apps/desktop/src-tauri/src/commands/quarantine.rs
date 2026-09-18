use tauri::State;
use serde::Serialize;
use gigacare_quarantine::models::{QuarantineEntry, QuarantineFilters, QuarantineStats};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub restored_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct PurgeResult {
    pub purged_count: usize,
}

#[tauri::command]
pub async fn list_quarantine(
    state: State<'_, AppState>,
    filters: Option<QuarantineFilters>,
) -> Result<Vec<QuarantineEntry>, String> {
    let q = state.quarantine.lock().await;
    Ok(q.list_entries(filters.as_ref()))
}

#[tauri::command]
pub async fn restore_items(
    state: State<'_, AppState>,
    entry_ids: Vec<String>,
) -> Result<RestoreResult, String> {
    let mut q = state.quarantine.lock().await;
    let mut restored_count = 0;
    let mut errors = Vec::new();

    for id in entry_ids {
        match q.restore_file(&id) {
            Ok(_) => restored_count += 1,
            Err(e) => errors.push(format!("{}: {}", id, e)),
        }
    }

    Ok(RestoreResult { restored_count, errors })
}

#[tauri::command]
pub async fn purge_expired(state: State<'_, AppState>) -> Result<PurgeResult, String> {
    let mut q = state.quarantine.lock().await;
    let purged = q.purge_expired().map_err(|e| e.to_string())?;
    Ok(PurgeResult { purged_count: purged.len() })
}

#[tauri::command]
pub async fn quarantine_stats(state: State<'_, AppState>) -> Result<QuarantineStats, String> {
    let q = state.quarantine.lock().await;
    Ok(q.stats())
}
