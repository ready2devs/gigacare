pub mod google_ai;
pub mod freellmapi;
pub mod ollama;

use async_trait::async_trait;
use crate::error::Result;
use crate::models::{AiProviderId, GroupAnalysisResult};

#[async_trait]
pub trait VisionProvider: Send + Sync {
    fn id(&self) -> AiProviderId;
    async fn analyze(&self, base64_images: &[String], keep_count: usize) -> Result<GroupAnalysisResult>;
}
