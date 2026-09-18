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
