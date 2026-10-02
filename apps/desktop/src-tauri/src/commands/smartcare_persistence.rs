use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::commands::drive_health::{get_drive_health, DriveHealthInfo};
use crate::commands::recycle_bin::scan_recycle_bin;
use crate::commands::app_usage::get_app_usage;
use crate::commands::apps::list_installed_apps;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SmartCareJunkSummary {
    pub temp_files_bytes: u64,
    pub windows_leftovers_bytes: u64,
    pub installers_bytes: u64,
    pub browser_caches_bytes: u64,
    pub messaging_caches_bytes: u64,
    pub recycle_bin_bytes: u64,
    pub total_bytes: u64,
    pub item_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SmartCareDevSummary {
    pub safe_caches_bytes: u64,
    pub unused_models_bytes: u64,
    pub stale_python_bytes: u64,
    pub total_bytes: u64,
    pub item_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SmartCareAppsSummary {
    pub unused_apps_count: u64,
    pub unused_apps_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SmartCareAnalysis {
    pub id: String,
    pub timestamp: String, // ISO-8601
    pub drive_health: DriveHealthInfo,
    pub junk_summary: SmartCareJunkSummary,
    pub dev_summary: SmartCareDevSummary,
    pub apps_summary: SmartCareAppsSummary,
    pub total_recoverable_bytes: u64,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartCareAnalysisProgress {
    pub phase: String,
    pub percent: f64,
}

pub fn get_analysis_file_path() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".gigacare").join("last_analysis.json"))
        .unwrap_or_else(|| PathBuf::from("last_analysis.json"))
}

pub fn save_analysis_to_path(path: &Path, analysis: &SmartCareAnalysis) -> bool {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(analysis) {
        Ok(json) => std::fs::write(path, json).is_ok(),
        Err(_) => false,
    }
}

pub fn load_analysis_from_path(path: &Path, cache_hours: u32) -> Option<SmartCareAnalysis> {
    if !path.exists() {
        return None;
    }

    let content = std::fs::read_to_string(path).ok()?;
    let analysis: SmartCareAnalysis = serde_json::from_str(&content).ok()?;

    let dt = DateTime::parse_from_rfc3339(&analysis.timestamp).ok()?.with_timezone(&Utc);
    let now = Utc::now();
    let age_hours = now.signed_duration_since(dt).num_hours();

    if age_hours >= (cache_hours as i64) || age_hours < 0 {
        return None;
    }

    Some(analysis)
}

#[tauri::command]
pub async fn save_smartcare_analysis(
    state: State<'_, AppState>,
    analysis: SmartCareAnalysis,
) -> Result<bool, String> {
    let file_path = get_analysis_file_path();
    let ok = save_analysis_to_path(&file_path, &analysis);

    let mut lock = state.smartcare_analysis.lock().await;
    *lock = Some(analysis);

    Ok(ok)
}

#[tauri::command]
pub async fn get_smartcare_analysis(
    state: State<'_, AppState>,
) -> Result<Option<SmartCareAnalysis>, String> {
    let config = state.config.lock().await.clone();
    let cache_hours = config.smartcare.analysis_cache_hours;

    // Check in-memory state
    {
        let lock = state.smartcare_analysis.lock().await;
        if let Some(ref a) = *lock {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&a.timestamp) {
                let age = Utc::now().signed_duration_since(dt.with_timezone(&Utc)).num_hours();
                if age < (cache_hours as i64) && age >= 0 {
                    return Ok(Some(a.clone()));
                }
            }
        }
    }

    // Load from disk
    let file_path = get_analysis_file_path();
    if let Some(loaded) = load_analysis_from_path(&file_path, cache_hours) {
        let mut lock = state.smartcare_analysis.lock().await;
        *lock = Some(loaded.clone());
        return Ok(Some(loaded));
    }

    Ok(None)
}

#[tauri::command]
pub async fn run_full_smartcare_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SmartCareAnalysis, String> {
    let config = state.config.lock().await.clone();

    // Step 1: Drive Health
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Analizando salud del disco...".to_string(),
        percent: 15.0,
    });
    let drive_health = get_drive_health("C:".to_string());

    // Step 2: Junk Files
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Escaneando archivos basura...".to_string(),
        percent: 35.0,
    });
    let (tx, _rx) = tokio::sync::mpsc::channel(64);
    let junk_result = gigacare_core::scanner::junk_files::JunkFilesScanner::scan(
        &config,
        &state.cancel_flag,
        &tx,
        None,
    ).await.unwrap_or(gigacare_core::scanner::junk_files::JunkFilesScanResult {
        total_junk_bytes: 0,
        categories: Vec::new(),
        browsers: Vec::new(),
        scan_timestamp: Utc::now().to_rfc3339(),
    });

    // Step 3: Recycle Bin
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Analizando papelera de reciclaje...".to_string(),
        percent: 55.0,
    });
    let rb_result = scan_recycle_bin(Some("C:".to_string()));

    // Consolidate Junk Summary
    let mut temp_files_bytes = 0u64;
    let mut windows_leftovers_bytes = 0u64;
    let mut installers_bytes = 0u64;
    let mut browser_caches_bytes = 0u64;
    let mut messaging_caches_bytes = 0u64;
    let mut item_count = 0u64;

    for cat in &junk_result.categories {
        match cat.category_id.as_str() {
            "temp_files" => temp_files_bytes += cat.total_bytes,
            "windows_leftovers" => windows_leftovers_bytes += cat.total_bytes,
            "download_installers" => installers_bytes += cat.total_bytes,
            "browser_caches" => browser_caches_bytes += cat.total_bytes,
            "messaging_cache" => messaging_caches_bytes += cat.total_bytes,
            _ => {}
        }
        item_count += cat.items.len() as u64;
    }
    item_count += rb_result.items.len() as u64;

    let junk_total = temp_files_bytes
        + windows_leftovers_bytes
        + installers_bytes
        + browser_caches_bytes
        + messaging_caches_bytes
        + rb_result.total_bytes;

    let junk_summary = SmartCareJunkSummary {
        temp_files_bytes,
        windows_leftovers_bytes,
        installers_bytes,
        browser_caches_bytes,
        messaging_caches_bytes,
        recycle_bin_bytes: rb_result.total_bytes,
        total_bytes: junk_total,
        item_count,
    };

    // Step 4: Apps Usage
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Analizando uso de aplicaciones...".to_string(),
        percent: 75.0,
    });
    let installed = list_installed_apps();
    let app_names: Vec<String> = installed.iter().map(|a| a.name.clone()).collect();
    let usage_list = get_app_usage(app_names);

    let threshold_days = config.smartcare.app_unused_threshold_days;
    let mut unused_apps_count = 0u64;
    let mut unused_apps_bytes = 0u64;

    for (app, usage) in installed.iter().zip(usage_list.iter()) {
        let is_unused = match (usage.last_used_days, usage.last_used_at.as_ref()) {
            (Some(days), _) if days > threshold_days => true,
            (_, None) => true,
            _ => false,
        };
        if is_unused {
            unused_apps_count += 1;
            unused_apps_bytes += app.size_bytes.unwrap_or(0);
        }
    }

    let apps_summary = SmartCareAppsSummary {
        unused_apps_count,
        unused_apps_bytes,
    };

    // Step 5: Dev Cleaning (safe caches, unused models, stale python)
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Escaneando cachés de desarrollo y modelos IA...".to_string(),
        percent: 90.0,
    });
    let dev_caches = tokio::task::spawn_blocking(gigacare_devcleaning::scan_dev_caches)
        .await
        .unwrap_or_else(|_| gigacare_devcleaning::DevCleanReport {
            disk_total: 0,
            disk_free: 0,
            findings: Vec::new(),
        });
    let ml_report = tokio::task::spawn_blocking(gigacare_devcleaning::scan_ml_models)
        .await
        .unwrap_or_else(|_| gigacare_devcleaning::MlModelReport {
            total_bytes: 0,
            unused_bytes: 0,
            usage_tracking_reliable: false,
            models: Vec::new(),
        });
    let py_report = tokio::task::spawn_blocking(gigacare_devcleaning::scan_python_envs)
        .await
        .unwrap_or_else(|_| gigacare_devcleaning::PyReport {
            total_bytes: 0,
            wasted_bytes: 0,
            envs: Vec::new(),
            duplicates: Vec::new(),
        });

    let mut safe_caches_bytes = 0u64;
    let mut dev_items = 0u64;
    for finding in &dev_caches.findings {
        if finding.safety == gigacare_devcleaning::DevSafety::Safe {
            safe_caches_bytes += finding.size_bytes;
            dev_items += 1;
        }
    }

    let model_threshold = config.smartcare.model_unused_threshold_days;
    let mut unused_models_bytes = 0u64;
    for model in &ml_report.models {
        let is_unused = !model.used_since_download
            || model.last_used_days.map(|d| d > (model_threshold as u64)).unwrap_or(false);
        if is_unused {
            unused_models_bytes += model.size_bytes;
            dev_items += 1;
        }
    }

    let py_threshold = config.smartcare.python_unused_threshold_days;
    let mut stale_python_bytes = 0u64;
    for env in &py_report.envs {
        if env.stale_days.map(|d| d > (py_threshold as u64)).unwrap_or(false) {
            stale_python_bytes += env.size_bytes;
            dev_items += 1;
        }
    }

    let dev_total = safe_caches_bytes + unused_models_bytes + stale_python_bytes;
    let dev_summary = SmartCareDevSummary {
        safe_caches_bytes,
        unused_models_bytes,
        stale_python_bytes,
        total_bytes: dev_total,
        item_count: dev_items,
    };

    // Step 6: Consolidation
    let _ = app.emit("smartcare-analysis-progress", SmartCareAnalysisProgress {
        phase: "Consolidando resultados...".to_string(),
        percent: 100.0,
    });

    let total_recoverable_bytes = junk_summary.total_bytes + dev_summary.total_bytes + apps_summary.unused_apps_bytes;

    let analysis = SmartCareAnalysis {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        drive_health,
        junk_summary,
        dev_summary,
        apps_summary,
        total_recoverable_bytes,
        is_valid: true,
    };

    let file_path = get_analysis_file_path();
    let _ = save_analysis_to_path(&file_path, &analysis);

    let mut lock = state.smartcare_analysis.lock().await;
    *lock = Some(analysis.clone());

    Ok(analysis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn sample_analysis(timestamp: String) -> SmartCareAnalysis {
        SmartCareAnalysis {
            id: "12345-uuid".to_string(),
            timestamp,
            drive_health: DriveHealthInfo {
                drive_letter: "C:".to_string(),
                drive_label: "OS".to_string(),
                drive_path: "C:\\".to_string(),
                total_bytes: 1_000_000_000,
                used_bytes: 400_000_000,
                free_bytes: 600_000_000,
                usage_percent: 40.0,
                disk_type: "SSD_NVMe".to_string(),
                filesystem: "NTFS".to_string(),
                smart_status: "Healthy".to_string(),
                temperature_celsius: Some(38.0),
                drive_wear_percent: Some(1.0),
                reallocated_sectors: Some(0),
                power_on_hours: Some(500),
                fill_forecast: None,
            },
            junk_summary: SmartCareJunkSummary {
                temp_files_bytes: 1000,
                windows_leftovers_bytes: 2000,
                installers_bytes: 3000,
                browser_caches_bytes: 4000,
                messaging_caches_bytes: 5000,
                recycle_bin_bytes: 6000,
                total_bytes: 21000,
                item_count: 50,
            },
            dev_summary: SmartCareDevSummary {
                safe_caches_bytes: 5000,
                unused_models_bytes: 10000,
                stale_python_bytes: 15000,
                total_bytes: 30000,
                item_count: 5,
            },
            apps_summary: SmartCareAppsSummary {
                unused_apps_count: 2,
                unused_apps_bytes: 50000,
            },
            total_recoverable_bytes: 101000,
            is_valid: true,
        }
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analysis.json");

        let analysis = sample_analysis(Utc::now().to_rfc3339());
        let saved = save_analysis_to_path(&path, &analysis);
        assert!(saved);

        let loaded = load_analysis_from_path(&path, 2);
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap(), analysis);
    }

    #[test]
    fn test_expired_analysis_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analysis_expired.json");

        // 5 hours ago, cache is 2 hours
        let past_time = (Utc::now() - Duration::hours(5)).to_rfc3339();
        let analysis = sample_analysis(past_time);
        save_analysis_to_path(&path, &analysis);

        let loaded = load_analysis_from_path(&path, 2);
        assert!(loaded.is_none());
    }

    #[test]
    fn test_recent_analysis_returns_some() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analysis_recent.json");

        // 30 minutes ago, cache is 1 hour
        let recent_time = (Utc::now() - Duration::minutes(30)).to_rfc3339();
        let analysis = sample_analysis(recent_time);
        save_analysis_to_path(&path, &analysis);

        let loaded = load_analysis_from_path(&path, 1);
        assert!(loaded.is_some());
    }

    #[test]
    fn test_corrupt_or_nonexistent_returns_none_without_crash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("corrupt.json");

        std::fs::write(&path, "NOT A VALID JSON CONTENT {").unwrap();
        let loaded = load_analysis_from_path(&path, 1);
        assert!(loaded.is_none());

        let nonexistent = dir.path().join("does_not_exist.json");
        let loaded_missing = load_analysis_from_path(&nonexistent, 1);
        assert!(loaded_missing.is_none());
    }
}
