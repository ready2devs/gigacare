use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use gigacare_core::models::PhotoGroup;
use crate::AppState;

#[tauri::command]
pub async fn find_photo_groups(state: State<'_, AppState>) -> Result<Vec<PhotoGroup>, String> {
    let cfg = state.config.lock().await;
    let user_pictures = dirs::picture_dir().unwrap_or_else(|| PathBuf::from("."));
    
    let mut paths = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&user_pictures) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let ext = ext.to_lowercase();
                if ext == "jpg" || ext == "jpeg" || ext == "png" {
                    paths.push(p);
                }
            }
        }
    }

    let groups = gigacare_core::find_photo_groups(&paths, cfg.photos.phash_threshold)
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

#[tauri::command]
pub async fn analyze_group_ai(
    app: AppHandle,
    state: State<'_, AppState>,
    group_id: String,
) -> Result<PhotoGroup, String> {
    let mut groups = state.cached_photo_groups.lock().await;
    let group = groups.iter_mut().find(|g| g.group_id == group_id)
        .ok_or_else(|| format!("Grupo {} no encontrado", group_id))?;

    let router = gigacare_ai::AiRouter::new(vec![], 10, 30);
    gigacare_core::analyze_group_ai(group, &router, 1)
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

#[tauri::command]
pub async fn analyze_all_groups_ai(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<PhotoGroup>, String> {
    let mut groups = state.cached_photo_groups.lock().await;
    let total = groups.len() as u64;
    let router = gigacare_ai::AiRouter::new(vec![], 10, 30);

    for (idx, group) in groups.iter_mut().enumerate() {
        let gid = group.group_id.clone();
        let _ = gigacare_core::analyze_group_ai(group, &router, 1).await;
        let _ = app.emit("ai-analysis-progress", gigacare_core::events::AiAnalysisProgress {
            groups_analyzed: (idx + 1) as u64,
            groups_total: total,
            current_provider: "local_fallback".into(),
            current_group_id: gid,
        });
    }

    Ok(groups.clone())
}
