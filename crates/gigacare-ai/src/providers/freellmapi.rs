use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::error::{AiError, Result};
use crate::models::{AiProviderId, GroupAnalysisResult};
use crate::prompts::EVALUATION_PROMPT;
use super::VisionProvider;

pub struct FreeLlmProvider {
    client: Client,
    endpoint: String,
    api_key: String,
}

impl FreeLlmProvider {
    pub fn new(endpoint: String, api_key: String) -> Self {
        Self {
            client: Client::new(),
            endpoint,
            api_key,
        }
    }
}

#[async_trait]
impl VisionProvider for FreeLlmProvider {
    fn id(&self) -> AiProviderId {
        AiProviderId::FreeLlmApi
    }

    async fn analyze(&self, base64_images: &[String], _keep_count: usize) -> Result<GroupAnalysisResult> {
        let mut content = vec![json!({ "type": "text", "text": EVALUATION_PROMPT })];
        for img in base64_images {
            content.push(json!({
                "type": "image_url",
                "image_url": { "url": format!("data:image/jpeg;base64,{}", img) }
            }));
        }

        let body = json!({
            "model": "auto",
            "messages": [{ "role": "user", "content": content }],
            "response_format": { "type": "json_object" }
        });

        let resp = self.client.post(&self.endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        if resp.status().as_u16() == 429 {
            return Err(AiError::ProviderQuotaExceeded { provider: "freellmapi".into() });
        }

        if !resp.status().is_success() {
            return Err(AiError::InvalidResponse(format!("HTTP {}", resp.status())));
        }

        let resp_json: serde_json::Value = resp.json().await?;
        let text = resp_json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("{}");

        let mut res: GroupAnalysisResult = serde_json::from_str(text)
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;
        res.provider_used = AiProviderId::FreeLlmApi;
        Ok(res)
    }
}
