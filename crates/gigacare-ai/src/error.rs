//! Errores de gigacare-ai

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("Error de red o HTTP: {0}")]
    Reqwest(#[from] reqwest::Error),

    #[error("Error de serialización JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Rate limit excedido para {provider}")]
    RateLimitExceeded { provider: String },

    #[error("Proveedor {provider} agotado por rate limit (HTTP 429)")]
    ProviderQuotaExceeded { provider: String },

    #[error("Respuesta de IA inválida: {0}")]
    InvalidResponse(String),

    #[error("Todos los proveedores de IA fallaron. Activando fallback local.")]
    AllProvidersFailed,
}

pub type Result<T> = std::result::Result<T, AiError>;
