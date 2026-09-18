use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;

use gigacare_config::AppConfig;
use gigacare_core::models::PhotoGroup;
use gigacare_quarantine::QuarantineManager;

pub mod commands;

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub quarantine: Mutex<QuarantineManager>,
    pub cancel_flag: Arc<AtomicBool>,
    pub cached_photo_groups: Mutex<Vec<PhotoGroup>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let q_dir = dirs::home_dir()
        .map(|h| h.join(".gigacare").join("quarantine"))
        .unwrap_or_else(|| PathBuf::from("quarantine"));

    let quarantine = QuarantineManager::with_defaults(q_dir)
        .expect("Fallo al inicializar QuarantineManager");

    let state = AppState {
        config: Mutex::new(AppConfig::default()),
        quarantine: Mutex::new(quarantine),
        cancel_flag: Arc::new(AtomicBool::new(false)),
        cached_photo_groups: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_smart_care,
            commands::scan::scan_module,
            commands::scan::cancel_scan,
            commands::clean::clean_items,
            commands::clean::preview_clean,
            commands::quarantine::list_quarantine,
            commands::quarantine::restore_items,
            commands::quarantine::purge_expired,
            commands::quarantine::quarantine_stats,
            commands::photos::find_photo_groups,
            commands::photos::analyze_group_ai,
            commands::photos::analyze_all_groups_ai,
            commands::apps::list_installed_apps,
            commands::apps::uninstall_app,
            commands::apps::scan_residuals,
            commands::startup::list_startup_items,
            commands::startup::toggle_startup_item,
            commands::space_map::build_space_map,
            commands::config::get_config,
            commands::config::update_config,
            commands::config::export_config,
            commands::config::import_config,
            commands::license::validate_api_key,
            commands::license::get_license_tier,
            commands::license::activate_pro,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
