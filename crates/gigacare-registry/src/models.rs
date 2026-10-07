use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub install_location: Option<String>,
    pub size_bytes: u64,
    pub data_bytes: u64, // Acumulado en AppData
    pub uninstall_command: Option<String>,
    pub install_date: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResidualEntry {
    pub label: String,   // "AppData Roaming · AppName"
    pub path: String,
    pub size_bytes: u64,
    pub confident: bool, // true=bundle_id match, false=name match
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResidualScanResult {
    pub app_name: String,
    pub entries: Vec<ResidualEntry>,
    pub total_residual_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UninstallResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub message: String,
    pub timed_out: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source: String, // "startup_folder"|"registry_hkcu"|"registry_hklm"|"task_scheduler"|"auto_service"
    pub impact: String, // "high"|"medium"|"low"
    pub enabled: bool,
    pub protected: bool,
    pub publisher: Option<String>,
}
