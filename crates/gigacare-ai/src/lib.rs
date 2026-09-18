//! # gigacare-ai
//!
//! Enrutador round-robin de proveedores de IA para curaduría visual,
//! rate limiting, reintentos en 429 y fallback local.

pub mod error;
pub mod models;
pub mod prompts;
pub mod providers;
pub mod rate_limiter;
pub mod router;

pub use error::{AiError, Result};
pub use models::{AiProviderId, GroupAnalysisResult, PhotoScore};
pub use prompts::{calculate_weighted_score, EVALUATION_PROMPT};
pub use providers::{
    freellmapi::FreeLlmProvider, google_ai::GoogleAiProvider, ollama::OllamaProvider,
    VisionProvider,
};
pub use rate_limiter::ProviderRateLimiter;
pub use router::AiRouter;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use wiremock::matchers::method;
    use wiremock::{Mock, MockServer, ResponseTemplate};
    use serde_json::json;

    fn sample_ai_response() -> serde_json::Value {
        json!({
            "analysis": [
                {
                    "photo_index": 0,
                    "sharpness": 0.9,
                    "eyes_open": 0.8,
                    "composition": 0.85,
                    "noise_absence": 0.95,
                    "total_weighted": 0.865,
                    "reasoning": "Excelente enfoque y composición"
                }
            ],
            "recommended_keep": [0],
            "recommended_discard": []
        })
    }

    #[tokio::test]
    async fn test_round_robin_and_429_retry() {
        let server_google = MockServer::start().await;
        let server_freellm = MockServer::start().await;

        // Google responde 429
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429))
            .mount(&server_google)
            .await;

        // FreeLLM responde exitoso
        let freellm_resp = json!({
            "choices": [{
                "message": {
                    "content": sample_ai_response().to_string()
                }
            }]
        });
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(freellm_resp))
            .mount(&server_freellm)
            .await;

        let google = Arc::new(GoogleAiProvider::new(server_google.uri(), "key".into()));
        let freellm = Arc::new(FreeLlmProvider::new(server_freellm.uri(), "key".into()));

        let router = AiRouter::new(vec![google, freellm], 10, 30);
        let res = router.analyze_group(&["base64_sample".into()], 1).await;

        // Debe haber rotado a FreeLLM tras el 429
        assert_eq!(res.provider_used, AiProviderId::FreeLlmApi);
        assert_eq!(res.recommended_keep, vec![0]);
    }

    #[tokio::test]
    async fn test_all_providers_failed_triggers_local_fallback() {
        let server1 = MockServer::start().await;
        let server2 = MockServer::start().await;

        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server1)
            .await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server2)
            .await;

        let p1 = Arc::new(GoogleAiProvider::new(server1.uri(), "key".into()));
        let p2 = Arc::new(FreeLlmProvider::new(server2.uri(), "key".into()));

        let router = AiRouter::new(vec![p1, p2], 10, 30);
        let res = router.analyze_group(&["img1".into(), "img2".into()], 1).await;

        assert_eq!(res.provider_used, AiProviderId::LocalFallback);
        assert_eq!(res.recommended_keep, vec![0]);
        assert_eq!(res.recommended_discard, vec![1]);
    }

    #[test]
    fn test_rate_limiter_blocks() {
        let limiter = ProviderRateLimiter::new(1, 1);
        assert!(limiter.check(AiProviderId::GoogleAiStudio).is_ok());
        // El segundo intento inmediato supera la cuota de 1 por minuto
        assert!(limiter.check(AiProviderId::GoogleAiStudio).is_err());
    }

    #[test]
    fn test_weighted_score_calculation() {
        let score = calculate_weighted_score(1.0, 1.0, 1.0, 1.0);
        assert!((score - 1.0).abs() < 1e-6);

        let weighted = calculate_weighted_score(0.85, 0.92, 0.78, 0.95);
        // (0.85*0.40) + (0.92*0.30) + (0.78*0.20) + (0.95*0.10)
        // = 0.34 + 0.276 + 0.156 + 0.095 = 0.867
        assert!((weighted - 0.867).abs() < 1e-4);
    }
}
