use std::collections::HashMap;
use std::path::Path;
use crate::models::AppInfo;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

/// Calcula el tamaño total en bytes de un directorio usando jwalk.
pub fn calculate_dir_size<P: AsRef<Path>>(path: P) -> u64 {
    let p = path.as_ref();
    if !p.exists() || !p.is_dir() {
        return 0;
    }
    jwalk::WalkDir::new(p)
        .skip_hidden(false)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.metadata().map(|m| m.len()).unwrap_or(0))
        .sum()
}

/// Normaliza un nombre eliminando caracteres especiales y convirtiendo a minúsculas.
pub fn normalize_app_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

/// Escanea las carpetas de AppData (Roaming y Local) buscando carpetas asociadas a la app
/// para estimar `data_bytes`.
pub fn estimate_app_data_bytes(app_name: &str) -> u64 {
    let norm = normalize_app_name(app_name);
    if norm.len() < 4 {
        return 0;
    }

    let mut total_bytes = 0u64;
    let mut check_dirs = Vec::new();

    if let Some(roaming) = dirs::data_dir() {
        check_dirs.push(roaming);
    }
    if let Some(local) = dirs::data_local_dir() {
        check_dirs.push(local);
    }

    for base in check_dirs {
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.filter_map(|e| e.ok()) {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let dir_name = entry.file_name().to_string_lossy().to_string();
                        let dir_norm = normalize_app_name(&dir_name);
                        if dir_norm.contains(&norm) || norm.contains(&dir_norm) {
                            total_bytes += calculate_dir_size(entry.path());
                        }
                    }
                }
            }
        }
    }

    total_bytes
}

/// Lee las aplicaciones instaladas en Windows enumerando los 3 hives principales:
/// 1. HKLM 64-bit: SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall
/// 2. HKLM 32-bit: SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall
/// 3. HKCU per-user: SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall
#[cfg(windows)]
pub fn get_installed_apps() -> Vec<AppInfo> {
    let mut apps_map: HashMap<String, AppInfo> = HashMap::new();

    let hives = [
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "registry"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "registry_wow64"),
        (HKEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "registry"),
    ];

    for (root, subkey_path, source_tag) in hives {
        let key = match RegKey::predef(root).open_subkey(subkey_path) {
            Ok(k) => k,
            Err(_) => continue,
        };

        for subkey_name in key.enum_keys().filter_map(|r| r.ok()) {
            let subkey = match key.open_subkey(&subkey_name) {
                Ok(k) => k,
                Err(_) => continue,
            };

            // Regla 1: Skip si SystemComponent == 1
            if let Ok(sys_comp) = subkey.get_value::<u32, _>("SystemComponent") {
                if sys_comp == 1 {
                    continue;
                }
            }

            // Regla 2: Skip si ParentKeyName existe (es sub-componente)
            if subkey.get_value::<String, _>("ParentKeyName").is_ok() {
                continue;
            }

            // Regla 3: DisplayName obligatorio y no vacío
            let name: String = match subkey.get_value("DisplayName") {
                Ok(n) => n,
                Err(_) => continue,
            };
            let trimmed_name = name.trim();
            if trimmed_name.is_empty() {
                continue;
            }

            let version: Option<String> = subkey.get_value("DisplayVersion").ok();
            let publisher: Option<String> = subkey.get_value("Publisher").ok();
            let install_location: Option<String> = subkey.get_value("InstallLocation").ok();
            let size_kb: u64 = subkey.get_value::<u32, _>("EstimatedSize").map(|k| k as u64).unwrap_or(0);
            let size_bytes = size_kb * 1024;
            let uninstall_command: Option<String> = subkey
                .get_value("QuietUninstallString")
                .ok()
                .or_else(|| subkey.get_value("UninstallString").ok());
            let install_date: Option<String> = subkey.get_value("InstallDate").ok();

            let norm_key = trimmed_name.to_lowercase();
            let id = format!("{}_{}", subkey_name, norm_key);

            let app_info = AppInfo {
                id,
                name: trimmed_name.to_string(),
                version,
                publisher,
                install_location,
                size_bytes,
                data_bytes: 0, // Calculable bajo demanda o residual sweeper
                uninstall_command,
                install_date,
                source: Some(source_tag.to_string()),
            };

            // Dedup por nombre lowercase: conservar el que tenga comando de desinstalación o más datos
            if let Some(existing) = apps_map.get_mut(&norm_key) {
                if existing.uninstall_command.is_none() && app_info.uninstall_command.is_some() {
                    *existing = app_info;
                } else if existing.size_bytes == 0 && app_info.size_bytes > 0 {
                    existing.size_bytes = app_info.size_bytes;
                }
            } else {
                apps_map.insert(norm_key, app_info);
            }
        }
    }

    let mut result: Vec<AppInfo> = apps_map.into_values().collect();
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    result
}

#[cfg(not(windows))]
pub fn get_installed_apps() -> Vec<AppInfo> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn test_task09_get_installed_apps_windows() {
        let apps = get_installed_apps();
        println!("Total de aplicaciones encontradas en el registro de Windows: {}", apps.len());
        assert!(!apps.is_empty(), "La lista de aplicaciones no debe estar vacía en Windows");

        let with_uninstall = apps.iter().filter(|a| a.uninstall_command.is_some()).count();
        println!("Aplicaciones con comando de desinstalación: {}", with_uninstall);
        assert!(
            with_uninstall > 0,
            "Al menos algunas aplicaciones deben tener uninstall_command"
        );

        for app in apps.iter().take(5) {
            println!("App: {} | Version: {:?} | Uninstall: {:?}", app.name, app.version, app.uninstall_command);
        }
    }
}
