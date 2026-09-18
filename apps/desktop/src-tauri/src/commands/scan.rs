use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use gigacare_core::models::{ModuleScanResult, ScanFilters, ScanResult};
use crate::AppState;

#[tauri::command]
pub async fn scan_smart_care(
    app: AppHandle,
    state: State<'_, AppState>,
    modules: Option<Vec<String>>,
) -> Result<ScanResult, String> {
    state.cancel_flag.store(false, Ordering::Relaxed);
    let config = state.config.lock().await.clone();
    let (tx, mut rx) = tokio::sync::mpsc::channel(64);

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_handle.emit("scan-progress", progress);
        }
    });

    let scanner = gigacare_core::scanner::Scanner::new(config, tx);
    let mod_enums = modules.map(|list| {
        list.into_iter()
            .filter_map(|s| match s.as_str() {
                "messaging_cache" => Some(gigacare_core::events::ScanModule::MessagingCache),
                "dev_dependencies" => Some(gigacare_core::events::ScanModule::DevDependencies),
                "system_temp" => Some(gigacare_core::events::ScanModule::SystemTemp),
                "installers" => Some(gigacare_core::events::ScanModule::Installers),
                "photo_duplicates" => Some(gigacare_core::events::ScanModule::PhotoDuplicates),
                "uninstall_residuals" => Some(gigacare_core::events::ScanModule::UninstallResiduals),
                "startup_items" => Some(gigacare_core::events::ScanModule::StartupItems),
                _ => None,
            })
            .collect()
    });

    scanner.scan_smart_care(mod_enums).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_module(
    state: State<'_, AppState>,
    module_id: String,
    _filters: Option<ScanFilters>,
) -> Result<ModuleScanResult, String> {
    state.cancel_flag.store(false, Ordering::Relaxed);
    let mod_enum = match module_id.as_str() {
        "messaging_cache" => gigacare_core::events::ScanModule::MessagingCache,
        "dev_dependencies" => gigacare_core::events::ScanModule::DevDependencies,
        "system_temp" => gigacare_core::events::ScanModule::SystemTemp,
        "installers" => gigacare_core::events::ScanModule::Installers,
        "photo_duplicates" => gigacare_core::events::ScanModule::PhotoDuplicates,
        "uninstall_residuals" => gigacare_core::events::ScanModule::UninstallResiduals,
        "startup_items" => gigacare_core::events::ScanModule::StartupItems,
        _ => return Err(format!("Módulo desconocido: {}", module_id)),
    };

    let config = state.config.lock().await.clone();
    let (tx, _rx) = tokio::sync::mpsc::channel(16);
    let scanner = gigacare_core::scanner::Scanner::new(config, tx);
    scanner.scan_module(mod_enum, _filters).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) {
    state.cancel_flag.store(true, Ordering::Relaxed);
}
