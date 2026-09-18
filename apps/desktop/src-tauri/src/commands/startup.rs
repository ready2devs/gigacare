use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source: String,
    pub impact: String,
    pub enabled: bool,
    pub protected: bool,
}

#[tauri::command]
pub fn list_startup_items() -> Vec<StartupItem> {
    vec![
        StartupItem {
            id: "startup-1".into(),
            name: "OneDrive".into(),
            path: r"C:\Program Files\Microsoft OneDrive\OneDrive.exe".into(),
            source: "registry_hkcu".into(),
            impact: "high".into(),
            enabled: true,
            protected: false,
        }
    ]
}

#[tauri::command]
pub fn toggle_startup_item(item_id: String, _enabled: bool) -> Result<(), String> {
    if item_id.to_lowercase().contains("windefend") {
        return Err("El servicio es protegido".into());
    }
    Ok(())
}
