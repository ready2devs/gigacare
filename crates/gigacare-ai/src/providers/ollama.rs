use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::error::{AiError, Result};
use crate::models::{AiProviderId, GroupAnalysisResult};
use crate::prompts::EVALUATION_PROMPT;
use super::VisionProvider;

pub struct OllamaProvider {
    client: Client,
    endpoint: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(endpoint: String, model: String) -> Self {
        Self {
            client: Client::new(),
            endpoint,
            model,
        }
    }
}

#[async_trait]
impl VisionProvider for OllamaProvider {
    fn id(&self) -> AiProviderId {
        AiProviderId::Ollama
    }

    async fn analyze(&self, base64_images: &[String], _keep_count: usize) -> Result<GroupAnalysisResult> {
        let body = json!({
            "model": self.model,
            "messages": [{
                "role": "user",
                "content": EVALUATION_PROMPT,
                "images": base64_images
            }],
            "format": "json",
            "stream": false
        });

        let resp = self.client.post(&self.endpoint)
            .json(&body)
            .send()
            .await?;

        if resp.status().as_u16() == 429 {
            return Err(AiError::ProviderQuotaExceeded { provider: "ollama".into() });
        }

        if !resp.status().is_success() {
            return Err(AiError::InvalidResponse(format!("HTTP {}", resp.status())));
        }

        let resp_json: serde_json::Value = resp.json().await?;
        let text = resp_json["message"]["content"]
            .as_str()
            .unwrap_or("{}");

        let mut res: GroupAnalysisResult = serde_json::from_str(text)
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;
        res.provider_used = AiProviderId::Ollama;
        Ok(res)
    }
}
