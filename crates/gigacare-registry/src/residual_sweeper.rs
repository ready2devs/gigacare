use std::path::PathBuf;
use crate::installed_apps::calculate_dir_size;
use crate::models::{ResidualEntry, ResidualScanResult};

/// Normaliza un nombre eliminando todo carácter no alfanumérico y convirtiéndolo a minúsculas.
pub fn normalize_for_matching(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

/// Escanea residuos de una aplicación en una lista de directorios base dados.
pub fn scan_residuals_in_dirs(app_name: &str, base_dirs: &[PathBuf]) -> ResidualScanResult {
    let norm_app = normalize_for_matching(app_name);
    let mut entries = Vec::new();
    let mut total_residual_bytes = 0u64;

    if norm_app.len() < 5 {
        return ResidualScanResult {
            app_name: app_name.to_string(),
            entries,
            total_residual_bytes: 0,
        };
    }

    for base in base_dirs {
        if !base.exists() || !base.is_dir() {
            continue;
        }

        let base_label = if base.to_string_lossy().contains("Roaming") {
            "AppData Roaming"
        } else if base.to_string_lossy().contains("Local") {
            "AppData Local"
        } else if base.to_string_lossy().contains("ProgramData") {
            "ProgramData"
        } else {
            base.file_name().and_then(|n| n.to_str()).unwrap_or("AppDir")
        };

        if let Ok(dir_entries) = std::fs::read_dir(base) {
            for entry in dir_entries.filter_map(|e| e.ok()) {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let dir_name = entry.file_name().to_string_lossy().to_string();
                        let dir_norm = normalize_for_matching(&dir_name);

                        // Match si dir_norm contiene norm_app o viceversa con longitud >= 5
                        let is_match = (dir_norm.len() >= 5 && dir_norm.contains(&norm_app))
                            || (norm_app.len() >= 5 && norm_app.contains(&dir_norm));

                        if is_match {
                            let path = entry.path();
                            let size = calculate_dir_size(&path);
                            let confident = dir_norm == norm_app;
                            let label = format!("{} · {}", base_label, dir_name);

                            entries.push(ResidualEntry {
                                label,
                                path: path.to_string_lossy().to_string(),
                                size_bytes: size,
                                confident,
                            });
                            total_residual_bytes += size;
                        }
                    }
                }
            }
        }
    }

    ResidualScanResult {
        app_name: app_name.to_string(),
        entries,
        total_residual_bytes,
    }
}

/// Escanea residuos de una aplicación en los directorios estándar de Windows:
/// %AppData%/Roaming, %AppData%/Local y %ProgramData%.
pub fn scan_app_residuals(app_name: &str) -> ResidualScanResult {
    let mut base_dirs = Vec::new();

    if let Some(roaming) = dirs::data_dir() {
        base_dirs.push(roaming);
    }
    if let Some(local) = dirs::data_local_dir() {
        base_dirs.push(local);
    }

    #[cfg(windows)]
    {
        if let Ok(prog_data) = std::env::var("ProgramData") {
            base_dirs.push(PathBuf::from(prog_data));
        } else {
            base_dirs.push(PathBuf::from("C:\\ProgramData"));
        }
    }

    scan_residuals_in_dirs(app_name, &base_dirs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_task11_residual_sweeper_detects_testapp123() {
        let temp = tempdir().unwrap();
        let base_roaming = temp.path().join("Roaming");
        let base_local = temp.path().join("Local");

        fs::create_dir_all(&base_roaming).unwrap();
        fs::create_dir_all(&base_local).unwrap();

        // 1. Crear carpeta TestApp123 en Roaming con un archivo de 2048 bytes
        let app_dir_roaming = base_roaming.join("TestApp123");
        fs::create_dir_all(&app_dir_roaming).unwrap();
        let file1 = app_dir_roaming.join("config.json");
        let mut f1 = File::create(&file1).unwrap();
        f1.write_all(&vec![b'A'; 2048]).unwrap();

        // 2. Crear carpeta testapp123_cache en Local con un archivo de 4096 bytes
        let app_dir_local = base_local.join("TestApp123_Cache");
        fs::create_dir_all(&app_dir_local).unwrap();
        let file2 = app_dir_local.join("cache.dat");
        let mut f2 = File::create(&file2).unwrap();
        f2.write_all(&vec![b'B'; 4096]).unwrap();

        // 3. Crear otra carpeta no relacionada
        let other_dir = base_local.join("UnrelatedApp");
        fs::create_dir_all(&other_dir).unwrap();
        let mut f3 = File::create(other_dir.join("data.bin")).unwrap();
        f3.write_all(&vec![b'C'; 1024]).unwrap();

        let bases = vec![base_roaming, base_local];
        let res = scan_residuals_in_dirs("TestApp123", &bases);

        println!("Residuos encontrados: {:?}", res);
        assert_eq!(res.entries.len(), 2, "Debe detectar las 2 carpetas de TestApp123");
        assert_eq!(res.total_residual_bytes, 2048 + 4096);
        assert!(res.entries.iter().any(|e| e.confident && e.path.contains("TestApp123")));
        assert!(res.entries.iter().any(|e| !e.confident && e.path.contains("TestApp123_Cache")));
    }
}
