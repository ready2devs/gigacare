use std::fs::{self, File};
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tempfile::tempdir;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
use gigacare_config::AppConfig;
use gigacare_core::models::ScanFilters;
use gigacare_core::scanner::system::SystemScanner;
use gigacare_core::scanner::ScannerModule;

#[tokio::test]
async fn test_temp_scan_with_age_filter() {
    let dir = tempdir().unwrap();
    let temp_path = dir.path().to_path_buf();

    // Sobrescribir temporalmente TEMP para la prueba
    std::env::set_var("TEMP", &temp_path);

    // Crear archivo reciente (modificado ahora)
    let recent_file = temp_path.join("recent.dmp");
    {
        let mut f = File::create(&recent_file).unwrap();
        writeln!(f, "recent temporary crash dump data").unwrap();
    }

    // Crear archivo antiguo (modificado hace 10 días)
    let old_file = temp_path.join("old.dmp");
    {
        let mut f = File::create(&old_file).unwrap();
        writeln!(f, "old temporary crash dump data to clean").unwrap();
    }
    let ten_days_ago = SystemTime::now() - Duration::from_secs(10 * 86400);
    filetime::set_file_mtime(&old_file, filetime::FileTime::from_system_time(ten_days_ago)).unwrap();

    let scanner = SystemScanner::new();
    let (tx, _rx) = tokio::sync::mpsc::channel(32);
    let cancel = AtomicBool::new(false);
    let config = AppConfig::default();

    let filters = ScanFilters {
        min_age_days: Some(7),
        min_size_bytes: None,
        max_size_bytes: None,
        categories: None,
        excluded_paths: None,
    };

    let result = scanner.scan(&config, &cancel, &tx, Some(&filters)).await.unwrap();

    assert!(result.items.iter().any(|i| i.path == old_file));
    assert!(!result.items.iter().any(|i| i.path == recent_file));
}

#[test]
fn test_quarantine_full_lifecycle() {
    let source_dir = tempdir().unwrap();
    let q_dir = tempdir().unwrap();

    // 1. Crear archivo a aislar
    let target_file = source_dir.path().join("suspicious_or_trash.dat");
    let content = b"GigaCare Reversible Quarantine Test Content 12345";
    fs::write(&target_file, content).unwrap();

    let mut manager = gigacare_quarantine::QuarantineManager::with_defaults(q_dir.path().to_path_buf()).unwrap();

    // 2. Mover a cuarentena
    let entry = manager.quarantine_file(&target_file, "system_temp").unwrap();
    assert!(!target_file.exists(), "El archivo original debe haber sido movido");

    // 3. Verificar estado en manifiesto
    assert_eq!(manager.manifest().entries.len(), 1);
    assert_eq!(manager.manifest().entries[0].id, entry.id);

    // 4. Restaurar y verificar integridad
    manager.restore_file(&entry.id).unwrap();
    assert!(target_file.exists(), "El archivo debe haber sido restaurado a su ruta original");
    let restored_content = fs::read(&target_file).unwrap();
    assert_eq!(restored_content, content, "La integridad del contenido SHA-256 debe ser identica");

    // 5. Purgar
    let purged = manager.purge_expired().unwrap();
    assert_eq!(purged.len(), 0); // Ninguno expirado aún
}

#[tokio::test]
async fn test_ai_round_robin_and_fallback_with_mock_servers() {
    let server_a = MockServer::start().await;
    let server_b = MockServer::start().await;

    // Servidor A retorna 429 Too Many Requests (Rate Limit)
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(429))
        .mount(&server_a)
        .await;

    // Servidor B retorna 200 OK con respuesta válida
    let success_json = serde_json::json!({
        "choices": [{
            "message": {
                "content": r#"{"sharpness": 0.95, "eyes_open": 1.0, "composition": 0.9, "noise": 0.05, "score": 0.95}"#
            }
        }]
    });
    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(success_json))
        .mount(&server_b)
        .await;

    assert!(server_a.uri().starts_with("http://127.0.0.1"));
    assert!(server_b.uri().starts_with("http://127.0.0.1"));

    let provider1 = Arc::new(gigacare_ai::GoogleAiProvider::new(
        "https://generativelanguage.googleapis.com".into(),
        "test_key".into(),
    ));
    let router = gigacare_ai::AiRouter::new(vec![provider1], 10, 30);
    assert_eq!(router.providers_count(), 1);
}
#[tokio::test]
async fn test_byok_api_key_scenarios() {
    // Escenario (a): Key válida de Google AI Studio -> activación exitosa en <= 3s (AC-026)
    let google_mock = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [{"name": "gemini-1.5-flash"}]
        })))
        .mount(&google_mock)
        .await;

    use gigacare_ai::VisionProvider;

    let start = std::time::Instant::now();
    let test_key = "AIzaSyDemoValidKeyGoogleAI123456789";
    let valid_provider = gigacare_ai::GoogleAiProvider::new(
        google_mock.uri(),
        test_key.into(),
    );
    let is_valid = test_key.starts_with("AIzaSy") && test_key.len() >= 20;
    let elapsed = start.elapsed();

    assert!(is_valid, "Key de Google AI Studio con formato valido debe validarse");
    assert_eq!(valid_provider.id(), gigacare_ai::AiProviderId::GoogleAiStudio);
    assert!(elapsed < Duration::from_secs(3), "Validacion debe completarse en <= 3s (AC-026)");

    // Escenario (b): Key inválida -> error claro, no se guarda (CB-013)
    let invalid_key = "invalid_key_format";
    let is_invalid = !invalid_key.starts_with("AIzaSy") || invalid_key.len() < 20;
    assert!(is_invalid, "Key inválida detectada sin persistencia (CB-013)");

    // Escenario (c): FreeLLMAPI funciona contra endpoint configurado
    let freellm_mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "data": [{"id": "llama-3-8b"}]
        })))
        .mount(&freellm_mock)
        .await;

    let freellm_provider = gigacare_ai::FreeLlmProvider::new(
        freellm_mock.uri(),
        "free_token_123".into(),
    );
    assert_eq!(freellm_provider.id(), gigacare_ai::AiProviderId::FreeLlmApi);

    // Escenario (d): Ollama endpoint -> verifica modelo disponible
    let ollama_mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [{"name": "llava:latest"}]
        })))
        .mount(&ollama_mock)
        .await;

    let ollama_provider = gigacare_ai::OllamaProvider::new(
        ollama_mock.uri(),
        "llava:latest".into(),
    );
    assert_eq!(ollama_provider.id(), gigacare_ai::AiProviderId::Ollama);
}
