use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::error::{AiError, Result};
use crate::models::{AiProviderId, GroupAnalysisResult};
use crate::prompts::EVALUATION_PROMPT;
use super::VisionProvider;

pub struct GoogleAiProvider {
    client: Client,
    endpoint: String,
    api_key: String,
}

impl GoogleAiProvider {
    pub fn new(endpoint: String, api_key: String) -> Self {
        Self {
            client: Client::new(),
            endpoint,
            api_key,
        }
    }
}

#[async_trait]
impl VisionProvider for GoogleAiProvider {
    fn id(&self) -> AiProviderId {
        AiProviderId::GoogleAiStudio
    }

    async fn analyze(&self, base64_images: &[String], _keep_count: usize) -> Result<GroupAnalysisResult> {
        let mut parts = vec![json!({ "text": EVALUATION_PROMPT })];
        for img in base64_images {
            parts.push(json!({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": img
                }
            }));
        }

        let body = json!({
            "contents": [{ "parts": parts }],
            "generationConfig": { "response_mime_type": "application/json" }
        });

        let url = if self.endpoint.contains("key=") {
            self.endpoint.clone()
        } else {
            format!("{}?key={}", self.endpoint, self.api_key)
        };

        let resp = self.client.post(&url).json(&body).send().await?;

        if resp.status().as_u16() == 429 {
            return Err(AiError::ProviderQuotaExceeded { provider: "google_ai_studio".into() });
        }

        if !resp.status().is_success() {
            return Err(AiError::InvalidResponse(format!("HTTP {}", resp.status())));
        }

        let resp_json: serde_json::Value = resp.json().await?;
        let text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("{}");

        let mut res: GroupAnalysisResult = serde_json::from_str(text)
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;
        res.provider_used = AiProviderId::GoogleAiStudio;
        Ok(res)
    }
}
