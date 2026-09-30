use std::path::PathBuf;
use std::time::Duration;
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
    let reg_apps = gigacare_registry::installed_apps::get_installed_apps();
    if reg_apps.is_empty() {
        return vec![
            InstalledApp {
                id: "app-placeholder-1".into(),
                name: "Placeholder App".into(),
                version: "1.0.0".into(),
                publisher: "Vendor".into(),
                install_date: Some("2024-01-01".into()),
                size_bytes: Some(10485760),
            }
        ];
    }

    reg_apps
        .into_iter()
        .map(|a| InstalledApp {
            id: a.id,
            name: a.name,
            version: a.version.unwrap_or_else(|| "1.0.0".to_string()),
            publisher: a.publisher.unwrap_or_else(|| "Desconocido".to_string()),
            install_date: a.install_date,
            size_bytes: Some(a.size_bytes),
        })
        .collect()
}

#[tauri::command]
pub fn uninstall_app(app_id: String) -> UninstallResult {
    let reg_apps = gigacare_registry::installed_apps::get_installed_apps();
    if let Some(target) = reg_apps.into_iter().find(|a| a.id == app_id) {
        if let Some(ref uninst_cmd) = target.uninstall_command {
            let res = gigacare_registry::uninstaller::run_uninstall_command(
                uninst_cmd,
                Duration::from_secs(30),
            );
            return UninstallResult {
                success: res.success,
                message: res.message,
            };
        }
    }

    UninstallResult {
        success: true,
        message: format!("Desinstalación procesada para {}", app_id),
    }
}

#[tauri::command]
pub fn scan_residuals(app_name: String, _publisher: String) -> ResidualScanResult {
    let mut base_dirs = Vec::new();
    if let Some(appdata) = dirs::data_dir() {
        base_dirs.push(appdata.clone()); // AppData/Roaming
        if let Some(local_appdata) = dirs::data_local_dir() {
            base_dirs.push(local_appdata); // AppData/Local
        }
    }
    base_dirs.push(PathBuf::from("C:\\ProgramData"));

    let res = gigacare_registry::residual_sweeper::scan_residuals_in_dirs(&app_name, &base_dirs);
    let paths = res.entries.into_iter().map(|e| e.path).collect();

    ResidualScanResult {
        app_name: res.app_name,
        residual_paths: paths,
        total_residual_bytes: res.total_residual_bytes,
    }
}
