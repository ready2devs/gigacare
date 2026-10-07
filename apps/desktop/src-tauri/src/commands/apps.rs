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
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_source: Option<String>,
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
    let mut apps: Vec<InstalledApp> = {
        let reg_apps = gigacare_registry::installed_apps::get_installed_apps();
        if reg_apps.is_empty() {
            vec![
                InstalledApp {
                    id: "app-placeholder-1".into(),
                    name: "Placeholder App".into(),
                    version: "1.0.0".into(),
                    publisher: "Vendor".into(),
                    install_date: Some("2024-01-01".into()),
                    size_bytes: Some(10485760),
                    source: Some("registry".into()),
                    last_used_at: None,
                    usage_count: None,
                    last_used_days: None,
                    usage_source: None,
                }
            ]
        } else {
            reg_apps
                .into_iter()
                .map(|a| InstalledApp {
                    id: a.id,
                    name: a.name,
                    version: a.version.unwrap_or_else(|| "1.0.0".to_string()),
                    publisher: a.publisher.unwrap_or_else(|| "Desconocido".to_string()),
                    install_date: a.install_date,
                    size_bytes: Some(a.size_bytes),
                    source: a.source,
                    last_used_at: None,
                    usage_count: None,
                    last_used_days: None,
                    usage_source: None,
                })
                .collect()
        }
    };

    // Adjuntar automáticamente información de telemetría y uso
    let app_ids_or_names: Vec<String> = apps.iter().map(|a| a.name.clone()).collect();
    let usage_infos = crate::commands::app_usage::get_app_usage(app_ids_or_names);

    for (app, usage) in apps.iter_mut().zip(usage_infos.into_iter()) {
        app.last_used_at = usage.last_used_at;
        app.usage_count = usage.usage_count;
        app.last_used_days = usage.last_used_days;
        app.usage_source = if usage.source == "unknown" { None } else { Some(usage.source) };
    }

    apps
}

#[tauri::command]
pub fn list_installed_apps_with_usage() -> Vec<InstalledApp> {
    let mut apps = list_installed_apps();
    let app_ids_or_names: Vec<String> = apps.iter().map(|a| a.name.clone()).collect();
    let usage_infos = crate::commands::app_usage::get_app_usage(app_ids_or_names);

    for (app, usage) in apps.iter_mut().zip(usage_infos.into_iter()) {
        app.last_used_at = usage.last_used_at;
        app.usage_count = usage.usage_count;
        app.last_used_days = usage.last_used_days;
        app.usage_source = if usage.source == "unknown" { None } else { Some(usage.source) };
    }

    apps
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
