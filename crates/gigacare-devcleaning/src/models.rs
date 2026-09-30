use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DevCategory {
    MlModels,
    DevCache,
    AppData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DevSafety {
    /// Regenerates automatically; safe to clear any time.
    Safe,
    /// Will be re-downloaded/rebuilt on demand — costs bandwidth or time.
    Caution,
    /// May contain state the user still wants; review before cleaning.
    Risky,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevChildEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevFinding {
    pub rule_id: String,
    pub name: String,
    pub description: String,
    pub category: DevCategory,
    pub safety: DevSafety,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub stale_days: Option<u64>,
    pub children: Vec<DevChildEntry>,
    pub read_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevCleanReport {
    pub disk_total: u64,
    pub disk_free: u64,
    pub findings: Vec<DevFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MlModelEntry {
    pub provider: String,
    pub name: String,
    pub size_bytes: u64,
    pub exclusive_bytes: u64,
    pub paths: Vec<String>,
    pub downloaded_days: Option<u64>,
    pub last_used_days: Option<u64>,
    pub used_since_download: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MlModelReport {
    pub total_bytes: u64,
    pub unused_bytes: u64,
    pub usage_tracking_reliable: bool,
    pub models: Vec<MlModelEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyPackage {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyEnv {
    pub name: String,
    pub path: String,
    pub kind: String, // "virtualenv" | "conda"
    pub size_bytes: u64,
    pub stale_days: Option<u64>,
    pub packages: Vec<PyPackage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyDuplicate {
    pub name: String,
    pub copies: usize,
    pub total_bytes: u64,
    pub wasted_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PyReport {
    pub total_bytes: u64,
    pub wasted_bytes: u64,
    pub envs: Vec<PyEnv>,
    pub duplicates: Vec<PyDuplicate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevCleanOutcome {
    pub freed_bytes: u64,
    pub quarantined_count: u64,
    pub errors: Vec<String>,
}
