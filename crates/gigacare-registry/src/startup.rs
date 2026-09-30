use crate::models::StartupItem;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

/// Heurística simple para asignar impacto al elemento de inicio.
fn estimate_impact(name: &str, path: &str) -> &'static str {
    let lower_name = name.to_lowercase();
    let lower_path = path.to_lowercase();
    if lower_path.contains("windows") || lower_path.contains("system32") || lower_name.contains("antivirus") {
        "high"
    } else if lower_name.contains("discord") || lower_name.contains("steam") || lower_name.contains("spotify") || lower_name.contains("electron") {
        "medium"
    } else {
        "low"
    }
}

/// Comprueba si la ruta está protegida por el sistema operativo.
fn is_system_protected(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("system32") || lower.contains("windows\\system")
}

/// Obtiene todos los elementos de inicio configurados en Windows:
/// Claves Run y RunOnce en HKCU y HKLM, servicios de inicio automático y carpeta Startup.
#[cfg(windows)]
pub fn get_startup_items() -> Vec<StartupItem> {
    let mut items = Vec::new();

    // 1. Claves del Registro (HKCU y HKLM)
    let reg_targets = [
        (HKEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", "registry_hkcu"),
        (HKEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "registry_hkcu"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", "registry_hklm"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "registry_hklm"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run", "registry_hklm"),
    ];

    for (root, subkey_path, source) in reg_targets {
        let key = match RegKey::predef(root).open_subkey(subkey_path) {
            Ok(k) => k,
            Err(_) => continue,
        };

        for val_res in key.enum_values() {
            if let Ok((name, val)) = val_res {
                if name.trim().is_empty() {
                    continue;
                }
                let path: String = val.to_string();
                let protected = is_system_protected(&path);
                let impact = estimate_impact(&name, &path).to_string();

                items.push(StartupItem {
                    id: format!("{}_{}", source, name),
                    name: name.clone(),
                    path,
                    source: source.to_string(),
                    impact,
                    enabled: true,
                    protected,
                    publisher: None,
                });
            }
        }
    }

    // 2. Servicios con inicio automático (Start == 2) en HKLM\SYSTEM\CurrentControlSet\Services
    if let Ok(services_key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SYSTEM\\CurrentControlSet\\Services") {
        for subkey_name in services_key.enum_keys().filter_map(|r| r.ok()) {
            if let Ok(service) = services_key.open_subkey(&subkey_name) {
                let start_type: u32 = service.get_value::<u32, _>("Start").unwrap_or(0);
                if start_type == 2 {
                    // Start == 2 indica inicio automático
                    let display_name: String = service.get_value("DisplayName").unwrap_or_else(|_| subkey_name.clone());
                    let image_path: String = service.get_value("ImagePath").unwrap_or_default();
                    if !image_path.is_empty() {
                        let protected = is_system_protected(&image_path);
                        let impact = estimate_impact(&display_name, &image_path).to_string();

                        items.push(StartupItem {
                            id: format!("service_{}", subkey_name),
                            name: display_name,
                            path: image_path,
                            source: "auto_service".to_string(),
                            impact,
                            enabled: true,
                            protected,
                            publisher: None,
                        });
                    }
                }
            }
        }
    }

    // 3. Carpeta Startup del usuario
    if let Some(roaming) = dirs::data_dir() {
        let startup_dir = roaming.join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
        if startup_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(startup_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let path = entry.path().to_string_lossy().to_string();
                    let impact = estimate_impact(&file_name, &path).to_string();

                    items.push(StartupItem {
                        id: format!("startup_folder_{}", file_name),
                        name: file_name,
                        path,
                        source: "startup_folder".to_string(),
                        impact,
                        enabled: true,
                        protected: false,
                        publisher: None,
                    });
                }
            }
        }
    }

    items
}

#[cfg(not(windows))]
pub fn get_startup_items() -> Vec<StartupItem> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn test_task12_get_startup_items_windows() {
        let items = get_startup_items();
        println!("Total startup items encontrados: {}", items.len());
        assert!(!items.is_empty(), "Debe retornar una lista no vacía de items de inicio");

        let has_source = items.iter().all(|i| !i.source.is_empty());
        assert!(has_source, "Todos los items deben tener source definido");

        let sources_found: std::collections::HashSet<&str> = items.iter().map(|i| i.source.as_str()).collect();
        println!("Fuentes encontradas: {:?}", sources_found);
        assert!(
            sources_found.contains("registry_hkcu")
                || sources_found.contains("registry_hklm")
                || sources_found.contains("auto_service"),
            "Debe contener fuentes reconocidas como registro o servicios automáticos"
        );

        for item in items.iter().take(5) {
            println!("Item: {} | Source: {} | Impact: {} | Enabled: {}", item.name, item.source, item.impact, item.enabled);
        }
    }
}
