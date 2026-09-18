//! Enrutador round-robin con rate limiting, cooldown y fallback local

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use crate::error::AiError;
use crate::models::{AiProviderId, GroupAnalysisResult, PhotoScore};
use crate::providers::VisionProvider;
use crate::rate_limiter::ProviderRateLimiter;

pub struct AiRouter {
    providers: Vec<Arc<dyn VisionProvider>>,
    rate_limiter: ProviderRateLimiter,
    current_index: AtomicUsize,
    cooldowns: Mutex<HashMap<AiProviderId, Instant>>,
    cooldown_duration: Duration,
}

impl AiRouter {
    pub fn new(
        providers: Vec<Arc<dyn VisionProvider>>,
        google_limit: u32,
        freellm_limit: u32,
    ) -> Self {
        Self {
            providers,
            rate_limiter: ProviderRateLimiter::new(google_limit, freellm_limit),
            current_index: AtomicUsize::new(0),
            cooldowns: Mutex::new(HashMap::new()),
            cooldown_duration: Duration::from_secs(60),
        }
    }

    pub fn with_cooldown(mut self, duration: Duration) -> Self {
        self.cooldown_duration = duration;
        self
    }

    pub fn providers_count(&self) -> usize {
        self.providers.len()
    }

    async fn is_in_cooldown(&self, id: AiProviderId) -> bool {
        let lock = self.cooldowns.lock().await;
        if let Some(until) = lock.get(&id) {
            if Instant::now() < *until {
                return true;
            }
        }
        false
    }

    async fn set_cooldown(&self, id: AiProviderId) {
        let mut lock = self.cooldowns.lock().await;
        lock.insert(id, Instant::now() + self.cooldown_duration);
    }

    pub async fn analyze_group(
        &self,
        base64_images: &[String],
        keep_count: usize,
    ) -> GroupAnalysisResult {
        let total = self.providers.len();
        if total == 0 {
            return self.local_fallback(base64_images, keep_count);
        }

        let start_idx = self.current_index.fetch_add(1, Ordering::Relaxed) % total;

        for step in 0..total {
            let idx = (start_idx + step) % total;
            let provider = &self.providers[idx];
            let id = provider.id();

            if self.is_in_cooldown(id).await {
                continue;
            }

            if self.rate_limiter.check(id).is_err() {
                continue;
            }

            match provider.analyze(base64_images, keep_count).await {
                Ok(res) => return res,
                Err(AiError::ProviderQuotaExceeded { .. }) => {
                    self.set_cooldown(id).await;
                    continue;
                }
                Err(_) => {
                    continue;
                }
            }
        }

        self.local_fallback(base64_images, keep_count)
    }

    pub fn local_fallback(
        &self,
        base64_images: &[String],
        keep_count: usize,
    ) -> GroupAnalysisResult {
        let mut scores = Vec::new();
        let total = base64_images.len();

        for i in 0..total {
            scores.push(PhotoScore {
                photo_index: i,
                sharpness: 0.5,
                eyes_open: 0.5,
                composition: 0.5,
                noise_absence: 0.5,
                total_weighted: 0.5,
                reasoning: "Análisis local aproximado por fallback".into(),
            });
        }

        let keep_n = keep_count.clamp(1, total);
        let recommended_keep: Vec<usize> = (0..keep_n).collect();
        let recommended_discard: Vec<usize> = (keep_n..total).collect();

        GroupAnalysisResult {
            provider_used: AiProviderId::LocalFallback,
            analysis: scores,
            recommended_keep,
            recommended_discard,
        }
    }
}
