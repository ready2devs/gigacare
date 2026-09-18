use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub install_date: Option<String>,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UninstallResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResidualScanResult {
    pub app_name: String,
    pub residual_paths: Vec<String>,
    pub total_residual_bytes: u64,
}

#[tauri::command]
pub fn list_installed_apps() -> Vec<InstalledApp> {
    vec![
        InstalledApp {
            id: "app-placeholder-1".into(),
            name: "Placeholder App".into(),
            version: "1.0.0".into(),
            publisher: "Vendor".into(),
            install_date: Some("2024-01-01".into()),
            size_bytes: Some(10485760),
        }
    ]
}

#[tauri::command]
pub fn uninstall_app(app_id: String) -> UninstallResult {
    UninstallResult {
        success: true,
        message: format!("Desinstalación iniciada para {}", app_id),
    }
}

#[tauri::command]
pub fn scan_residuals(app_name: String, _publisher: String) -> ResidualScanResult {
    ResidualScanResult {
        app_name,
        residual_paths: Vec::new(),
        total_residual_bytes: 0,
    }
}
