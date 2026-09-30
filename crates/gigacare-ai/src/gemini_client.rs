use reqwest::{Client, StatusCode};
use serde_json::json;

use crate::error::{AiError, Result};
use crate::models::{FileFilterQuery, TreeSummaryNode};
use crate::prompts::SYSTEM_PROMPT_NL_QUERY;

pub const DEFAULT_GEMINI_MODEL: &str = "gemini-2.0-flash";

#[derive(Clone)]
pub struct GeminiClient {
    client: Client,
    api_key: Option<String>,
    base_url: Option<String>, // Útil para tests con wiremock
}

impl GeminiClient {
    pub fn new() -> Self {
        let api_key = Self::resolve_api_key();
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

    /// Resolución de API Key en orden de prioridad:
    /// 1. Variable de entorno GIGACARE_GEMINI_KEY
    /// 2. ~/.gigacare/config.json -> byok.google_ai_studio
    pub fn resolve_api_key() -> Option<String> {
        if let Ok(key) = std::env::var("GIGACARE_GEMINI_KEY") {
            let trimmed = key.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }

        // Buscar en config.json
        if let Some(home) = dirs::home_dir() {
            let config_path = home.join(".gigacare").join("config.json");
            if config_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&config_path) {
                    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(key) = json_val
                            .get("byok")
                            .and_then(|b| b.get("google_ai_studio"))
                            .and_then(|k| k.as_str())
                        {
                            let trimmed = key.trim();
                            if !trimmed.is_empty() {
                                return Some(trimmed.to_string());
                            }
                        }
                    }
                }
            }
        }

        None
    }

    pub async fn send_nl_query(
        &self,
        query: &str,
        tree_summary: &[TreeSummaryNode],
    ) -> Result<FileFilterQuery> {
        let api_key = self.api_key.as_ref().ok_or_else(|| {
            AiError::InvalidResponse(
                "API Key no configurada. Configura GIGACARE_GEMINI_KEY o añade byok.google_ai_studio en config.json".to_string(),
            )
        })?;

        let tree_summary_json = serde_json::to_string(tree_summary).unwrap_or_else(|_| "[]".to_string());
        let prompt_with_context = SYSTEM_PROMPT_NL_QUERY.replace("{tree_summary_json}", &tree_summary_json);

        let url = if let Some(ref base) = self.base_url {
            format!("{}/v1beta/models/{}:generateContent?key={}", base, DEFAULT_GEMINI_MODEL, api_key)
        } else {
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                DEFAULT_GEMINI_MODEL, api_key
            )
        };

        let request_body = json!({
            "contents": [{
                "parts": [
                    {
                        "text": format!("{}

Consulta del usuario: {}", prompt_with_context, query)
                    }
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1
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
                        AiError::InvalidResponse("Formato de respuesta Gemini inesperado sin texto".to_string())
                    })?;

                let parsed: FileFilterQuery = serde_json::from_str(text_content).map_err(|e| {
                    AiError::InvalidResponse(format!("Error parseando FileFilterQuery del JSON de Gemini: {}", e))
                })?;

                Ok(parsed)
            }
            StatusCode::TOO_MANY_REQUESTS => Err(AiError::ProviderQuotaExceeded {
                provider: "google_ai_studio".to_string(),
            }),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(AiError::InvalidResponse(
                "Error 401/403: API Key de Google AI Studio inválida o no autorizada".to_string(),
            )),
            status => Err(AiError::InvalidResponse(format!(
                "Gemini API retornó código HTTP de error: {}",
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
    async fn test_task26_send_nl_query_with_mock_server() {
        let mock_server = MockServer::start().await;

        let mock_response_body = json!({
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": r#"{
                            "conditions": [
                                {
                                    "field": "size_bytes",
                                    "operator": "gt",
                                    "value": 1073741824
                                },
                                {
                                    "field": "category",
                                    "operator": "eq",
                                    "value": "video"
                                }
                            ],
                            "logical_operator": "AND"
                        }"#
                    }]
                }
            }]
        });

        Mock::given(method("POST"))
            .and(path_regex("/v1beta/models/.*"))
            .respond_with(ResponseTemplate::new(200).set_body_json(mock_response_body))
            .mount(&mock_server)
            .await;

        let client = GeminiClient::with_base_url_and_key(mock_server.uri(), "test_api_key".to_string());
        let result = client.send_nl_query("videos de más de 1GB", &[]).await;

        assert!(result.is_ok(), "Debe parsear correctamente la respuesta simulada");
        let query = result.unwrap();
        assert_eq!(query.logical_operator, "AND");
        assert_eq!(query.conditions.len(), 2);
        assert_eq!(query.conditions[0].field, "size_bytes");
        assert_eq!(query.conditions[0].operator, "gt");
        assert_eq!(query.conditions[0].value, json!(1073741824));
        assert_eq!(query.conditions[1].field, "category");
    }

    #[tokio::test]
    async fn test_task26_rate_limit_429_handling() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path_regex("/v1beta/models/.*"))
            .respond_with(ResponseTemplate::new(429))
            .mount(&mock_server)
            .await;

        let client = GeminiClient::with_base_url_and_key(mock_server.uri(), "test_api_key".to_string());
        let result = client.send_nl_query("videos grandes", &[]).await;

        assert!(result.is_err());
        match result.err().unwrap() {
            AiError::ProviderQuotaExceeded { provider } => {
                assert_eq!(provider, "google_ai_studio");
            }
            other => panic!("Esperaba ProviderQuotaExceeded, obtuve: {:?}", other),
        }
    }
}
