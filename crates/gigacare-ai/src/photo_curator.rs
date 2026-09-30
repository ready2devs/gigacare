use reqwest::{Client, StatusCode};
use serde_json::json;

use crate::error::{AiError, Result};
use crate::gemini_client::{GeminiClient, DEFAULT_GEMINI_MODEL};
use crate::models::GeminiPhotoResponse;
use crate::prompts::SYSTEM_PROMPT_PHOTO_CURATOR;

pub struct PhotoCuratorClient {
    client: Client,
    api_key: Option<String>,
    base_url: Option<String>,
}

impl PhotoCuratorClient {
    pub fn new() -> Self {
        let api_key = GeminiClient::resolve_api_key();
        Self {
            client: Client::new(),
            api_key,
            base_url: None,
        }
    }

    pub fn with_api_key(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key: Some(api_key),
            base_url: None,
        }
    }

    pub fn with_base_url_and_key(base_url: String, api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key: Some(api_key),
            base_url: Some(base_url),
        }
    }

    pub async fn curate_photos(
        &self,
        base64_thumbnails: &[String],
        keep_count: usize,
    ) -> Result<GeminiPhotoResponse> {
        let api_key = self.api_key.as_ref().ok_or_else(|| {
            AiError::InvalidResponse(
                "API Key no configurada para Gemini Photo Curator".to_string(),
            )
        })?;

        let url = if let Some(ref base) = self.base_url {
            format!("{}/v1beta/models/{}:generateContent?key={}", base, DEFAULT_GEMINI_MODEL, api_key)
        } else {
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                DEFAULT_GEMINI_MODEL, api_key
            )
        };

        let mut parts = Vec::new();
        parts.push(json!({
            "text": format!(
                "{}

Grupo de {} fotos similares. Conservar: {}.",
                SYSTEM_PROMPT_PHOTO_CURATOR,
                base64_thumbnails.len(),
                keep_count
            )
        }));

        for thumb in base64_thumbnails {
            parts.push(json!({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": thumb
                }
            }));
        }

        let request_body = json!({
            "contents": [{
                "parts": parts
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2
            }
        });

        let resp = self
            .client
            .post(&url)
            .json(&request_body)
            .send()
            .await?;

        match resp.status() {
            StatusCode::OK => {
                let body: serde_json::Value = resp.json().await?;
                let text_content = body
                    .get("candidates")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("content"))
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.get(0))
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                    .ok_or_else(|| {
                        AiError::InvalidResponse("Respuesta de Gemini sin texto JSON de análisis".to_string())
                    })?;

                let parsed: GeminiPhotoResponse = serde_json::from_str(text_content).map_err(|e| {
                    AiError::InvalidResponse(format!("Error parseando GeminiPhotoResponse: {}", e))
                })?;

                Ok(parsed)
            }
            StatusCode::TOO_MANY_REQUESTS => Err(AiError::ProviderQuotaExceeded {
                provider: "google_ai_studio".to_string(),
            }),
            status => Err(AiError::InvalidResponse(format!(
                "Gemini Photo Curator retornó status {}",
                status
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path_regex};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_task28_photo_curator_mock_4_scores() {
        let mock_server = MockServer::start().await;

        let mock_body = json!({
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": r#"{
                            "analysis": [
                                {
                                    "photo_index": 0,
                                    "sharpness": 0.90,
                                    "eyes_open": 0.95,
                                    "composition": 0.85,
                                    "noise_absence": 0.92,
                                    "total_weighted": 0.903,
                                    "reasoning": "Enfoque nítido y ojos abiertos"
                                },
                                {
                                    "photo_index": 1,
                                    "sharpness": 0.60,
                                    "eyes_open": 0.50,
                                    "composition": 0.70,
                                    "noise_absence": 0.80,
                                    "total_weighted": 0.61,
                                    "reasoning": "Ligero desenfoque de movimiento"
                                },
                                {
                                    "photo_index": 2,
                                    "sharpness": 0.40,
                                    "eyes_open": 0.0,
                                    "composition": 0.50,
                                    "noise_absence": 0.75,
                                    "total_weighted": 0.335,
                                    "reasoning": "Ojos cerrados"
                                },
                                {
                                    "photo_index": 3,
                                    "sharpness": 0.80,
                                    "eyes_open": 0.85,
                                    "composition": 0.75,
                                    "noise_absence": 0.90,
                                    "total_weighted": 0.815,
                                    "reasoning": "Buena foto alternativa"
                                }
                            ],
                            "recommended_keep": [0],
                            "recommended_discard": [1, 2, 3]
                        }"#
                    }]
                }
            }]
        });

        Mock::given(method("POST"))
            .and(path_regex("/v1beta/models/.*"))
            .respond_with(ResponseTemplate::new(200).set_body_json(mock_body))
            .mount(&mock_server)
            .await;

        let curator = PhotoCuratorClient::with_base_url_and_key(mock_server.uri(), "test_key".to_string());
        let thumbs = vec![
            "thumb0_base64".to_string(),
            "thumb1_base64".to_string(),
            "thumb2_base64".to_string(),
            "thumb3_base64".to_string(),
        ];

        let result = curator.curate_photos(&thumbs, 1).await;
        assert!(result.is_ok(), "Debe parsear exitosamente la respuesta");
        let parsed = result.unwrap();

        assert_eq!(parsed.analysis.len(), 4, "Debe contener los 4 scores");
        assert_eq!(parsed.recommended_keep, vec![0]);
        assert_eq!(parsed.recommended_discard, vec![1, 2, 3]);
        assert_eq!(parsed.analysis[0].photo_index, 0);
        assert!((parsed.analysis[0].total_weighted - 0.903).abs() < 1e-4);
        assert_eq!(parsed.analysis[2].eyes_open, 0.0);
    }
}
