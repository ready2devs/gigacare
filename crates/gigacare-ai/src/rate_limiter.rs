//! Rate limiting con governor por proveedor

use std::num::NonZeroU32;
use std::sync::Arc;
use governor::clock::DefaultClock;
use governor::state::{InMemoryState, NotKeyed};
use governor::{Quota, RateLimiter};

use crate::error::{AiError, Result};
use crate::models::AiProviderId;

type DirectLimiter = RateLimiter<NotKeyed, InMemoryState, DefaultClock>;

pub struct ProviderRateLimiter {
    google_limiter: Option<Arc<DirectLimiter>>,
    freellm_limiter: Option<Arc<DirectLimiter>>,
}

impl ProviderRateLimiter {
    pub fn new(google_per_min: u32, freellm_per_min: u32) -> Self {
        let google_limiter = NonZeroU32::new(google_per_min).map(|q| {
            Arc::new(RateLimiter::direct(Quota::per_minute(q)))
        });
        let freellm_limiter = NonZeroU32::new(freellm_per_min).map(|q| {
            Arc::new(RateLimiter::direct(Quota::per_minute(q)))
        });

        Self {
            google_limiter,
            freellm_limiter,
        }
    }

    pub fn check(&self, provider: AiProviderId) -> Result<()> {
        match provider {
            AiProviderId::GoogleAiStudio => {
                if let Some(limiter) = &self.google_limiter {
                    limiter.check().map_err(|_| AiError::RateLimitExceeded {
                        provider: provider.to_string(),
                    })?;
                }
            }
            AiProviderId::FreeLlmApi => {
                if let Some(limiter) = &self.freellm_limiter {
                    limiter.check().map_err(|_| AiError::RateLimitExceeded {
                        provider: provider.to_string(),
                    })?;
                }
            }
            AiProviderId::Ollama | AiProviderId::LocalFallback => {
                // Ollama y fallback local sin límite
            }
        }
        Ok(())
    }
}
