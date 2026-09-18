use tauri::State;
use gigacare_config::AppConfig;
use crate::AppState;

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let cfg = state.config.lock().await;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, AppState>,
    config: serde_json::Value,
) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().await;
    let json_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let updated: AppConfig = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    *cfg = updated.clone();
    Ok(updated)
}

#[tauri::command]
pub async fn export_config(state: State<'_, AppState>) -> Result<String, String> {
    let cfg = state.config.lock().await;
    serde_json::to_string_pretty(&*cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_config(
    state: State<'_, AppState>,
    json: String,
) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().await;
    let imported: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    *cfg = imported.clone();
    Ok(imported)
}
