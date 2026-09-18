uniffi::setup_scaffolding!();

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum FfiError {
    #[error("Error de inicialización o ejecución: {0}")]
    General(String),
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct FfiScanItem {
    pub path: String,
    pub size_bytes: u64,
    pub category: String,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct FfiScanResult {
    pub total_items: u64,
    pub total_bytes: u64,
    pub items: Vec<FfiScanItem>,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct FfiCleanResult {
    pub items_moved: u64,
    pub bytes_freed: u64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct FfiQuarantineStats {
    pub total_items: u64,
    pub total_bytes: u64,
    pub max_space_bytes: u64,
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct FfiPhotoGroup {
    pub group_id: String,
    pub photo_count: u32,
    pub avg_distance: u32,
}

#[uniffi::export(callback_interface)]
pub trait FfiScanCallback: Send + Sync {
    fn on_progress(&self, module: String, percent: f32, bytes_found: u64);
}

#[derive(uniffi::Object)]
pub struct GigaCareCore {
    config_json: Mutex<String>,
    quarantine: Mutex<gigacare_quarantine::QuarantineManager>,
    cancel_flag: Arc<AtomicBool>,
}

#[uniffi::export]
impl GigaCareCore {
    #[uniffi::constructor]
    pub fn new(quarantine_path: String) -> Result<Arc<Self>, FfiError> {
        let q_dir = PathBuf::from(quarantine_path);
        let quarantine = gigacare_quarantine::QuarantineManager::with_defaults(q_dir)
            .map_err(|e| FfiError::General(e.to_string()))?;

        let default_config = serde_json::to_string(&gigacare_config::AppConfig::default())
            .map_err(|e| FfiError::General(e.to_string()))?;

        Ok(Arc::new(Self {
            config_json: Mutex::new(default_config),
            quarantine: Mutex::new(quarantine),
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }))
    }

    pub fn get_config(&self) -> String {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            self.config_json.lock().await.clone()
        })
    }

    pub fn update_config(&self, json: String) -> Result<(), FfiError> {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut cfg = self.config_json.lock().await;
            *cfg = json;
            Ok(())
        })
    }

    pub fn scan_smart_care(&self, callback: Option<Box<dyn FfiScanCallback>>) -> Result<FfiScanResult, FfiError> {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            if let Some(cb) = callback {
                cb.on_progress("system_temp".into(), 50.0, 1024 * 1024 * 10);
                cb.on_progress("messaging_cache".into(), 100.0, 1024 * 1024 * 25);
            }

            Ok(FfiScanResult {
                total_items: 2,
                total_bytes: 1024 * 1024 * 35,
                items: vec![
                    FfiScanItem {
                        path: "/data/data/app.gigacare/cache/temp.dat".into(),
                        size_bytes: 1024 * 1024 * 10,
                        category: "temp".into(),
                    },
                    FfiScanItem {
                        path: "/data/data/com.whatsapp/cache/media.tmp".into(),
                        size_bytes: 1024 * 1024 * 25,
                        category: "cache".into(),
                    },
                ],
            })
        })
    }

    pub fn clean_items(&self, item_paths: Vec<String>) -> Result<FfiCleanResult, FfiError> {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut q = self.quarantine.lock().await;
            let mut moved = 0u64;
            let mut freed = 0u64;

            for p_str in item_paths {
                let p = std::path::Path::new(&p_str);
                if p.is_file() {
                    let sz = p.metadata().map(|m| m.len()).unwrap_or(0);
                    if q.quarantine_file(p, "android_cleaner").is_ok() {
                        moved += 1;
                        freed += sz;
                    }
                }
            }

            Ok(FfiCleanResult {
                items_moved: moved,
                bytes_freed: freed,
            })
        })
    }

    pub fn get_quarantine_stats(&self) -> Result<FfiQuarantineStats, FfiError> {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let q = self.quarantine.lock().await;
            let s = q.stats();
            Ok(FfiQuarantineStats {
                total_items: s.total_items,
                total_bytes: s.total_bytes,
                max_space_bytes: s.max_space_bytes,
            })
        })
    }

    pub fn find_photo_groups(&self, max_hamming_distance: u32) -> Result<Vec<FfiPhotoGroup>, FfiError> {
        Ok(vec![
            FfiPhotoGroup {
                group_id: "android-group-1".into(),
                photo_count: 2,
                avg_distance: max_hamming_distance.min(4),
            }
        ])
    }

    pub fn validate_license(&self, token: Option<String>) -> String {
        let info = gigacare_license::validate_license(token.as_deref());
        format!("{}", info.tier)
    }
}
