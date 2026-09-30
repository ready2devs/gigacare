//! Modelos y esquemas para análisis de IA

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiProviderId {
    GoogleAiStudio,
    FreeLlmApi,
    Ollama,
    LocalFallback,
}

impl std::fmt::Display for AiProviderId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProviderId::GoogleAiStudio => write!(f, "google_ai_studio"),
            AiProviderId::FreeLlmApi => write!(f, "freellmapi"),
            AiProviderId::Ollama => write!(f, "ollama"),
            AiProviderId::LocalFallback => write!(f, "local_fallback"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PhotoScore {
    pub photo_index: usize,
    pub sharpness: f64,
    pub eyes_open: f64,
    pub composition: f64,
    pub noise_absence: f64,
    pub total_weighted: f64,
    pub reasoning: String,
}

impl Default for AiProviderId {
    fn default() -> Self {
        AiProviderId::LocalFallback
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupAnalysisResult {
    #[serde(default)]
    pub provider_used: AiProviderId,
    pub analysis: Vec<PhotoScore>,
    pub recommended_keep: Vec<usize>,
    pub recommended_discard: Vec<usize>,
}



#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    pub modified_at: u64, // Unix timestamp
    pub extension: Option<String>,
    pub is_system: bool,
    #[serde(default)]
    pub children: Vec<FileNode>,
    #[serde(default)]
    pub item_count: u64,
}

// ─── NL Query Pipeline ───

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileFilterQuery {
    pub conditions: Vec<FilterCondition>,
    pub logical_operator: String, // "AND"|"OR"
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FilterCondition {
    pub field: String,    // "extension"|"size_bytes"|"modified_at"|"path"|"category"|"name"
    pub operator: String, // "eq"|"gt"|"lt"|"gte"|"lte"|"contains"|"in"|"not_in"|"older_than_days"
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileFilterResult {
    pub query_parsed: FileFilterQuery,
    pub matched_paths: Vec<String>,
    pub total_matched: usize,
    pub total_bytes: u64,
    pub summary: String, // "Se identificaron 38 archivos (24.3 GB recuperables)"
}

// ─── Tree Summary for AI (sin violar privacidad) ───

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TreeSummaryNode {
    pub path_depth: u32, // Profundidad relativa, NO ruta real
    pub name: String,    // Solo nombre de carpeta, no ruta completa
    pub total_size_bytes: u64,
    pub file_count: u64,
    pub extensions_summary: Vec<ExtensionSummary>,
    pub oldest_file_days: Option<u64>,
    pub newest_file_days: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExtensionSummary {
    pub extension: String, // ".mp4", ".jpg", ".exe"
    pub count: u64,
    pub total_bytes: u64,
    pub avg_size_bytes: u64,
}


#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoQuarantineRule {
    pub id: String,
    pub description: String, // "Capturas de pantalla > 90 días"
    pub condition: FileFilterQuery,
    pub matched_count: usize,
    pub matched_bytes: u64,
    pub user_approved: bool,
}

// ─── Gemini Response Schema ───

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeminiPhotoScore {
    pub photo_index: usize,
    pub sharpness: f64,
    pub eyes_open: f64,
    pub composition: f64,
    pub noise_absence: f64,
    pub total_weighted: f64,
    pub reasoning: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeminiPhotoResponse {
    pub analysis: Vec<GeminiPhotoScore>,
    pub recommended_keep: Vec<usize>,
    pub recommended_discard: Vec<usize>,
}
