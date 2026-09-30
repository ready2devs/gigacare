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
    if let Ok(full) = serde_json::from_value::<AppConfig>(config.clone()) {
        *cfg = full;
    } else {
        cfg.merge_partial(&config).map_err(|e| e.to_string())?;
    }

    if let Some(home) = dirs::home_dir() {
        let p = home.join(".gigacare").join("config.json");
        let _ = cfg.save(&p);
    }

    let max_bytes = (cfg.quarantine.max_size_gb * 1024.0 * 1024.0 * 1024.0) as u64;
    let mut q = state.quarantine.lock().await;
    q.set_max_space_bytes(max_bytes);
    let _ = q.set_retention_days(cfg.quarantine.retention_days);

    Ok(cfg.clone())
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

    if let Some(home) = dirs::home_dir() {
        let p = home.join(".gigacare").join("config.json");
        let _ = cfg.save(&p);
    }

    let max_bytes = (cfg.quarantine.max_size_gb * 1024.0 * 1024.0 * 1024.0) as u64;
    let mut q = state.quarantine.lock().await;
    q.set_max_space_bytes(max_bytes);
    let _ = q.set_retention_days(cfg.quarantine.retention_days);

    Ok(imported)
}
