//! Módulo de detección y escaneo de cachés de navegadores web.
//!
//! Detecta navegadores Chromium (Chrome, Edge, Brave, Opera, Vivaldi)
//! y Firefox, enumerando sus perfiles y calculando el tamaño de
//! sus directorios de caché.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// ─────────────────────────── Structs ──────────────────────────────

/// Perfil de caché de un navegador completo, agrupando todos sus perfiles de usuario.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserCacheProfile {
    /// Nombre legible del navegador (ej: "Google Chrome").
    pub browser_name: String,
    /// Identificador único del navegador (ej: "chrome").
    pub browser_id: String,
    /// Si el directorio base del navegador existe en el sistema.
    pub installed: bool,
    /// Lista de perfiles de usuario encontrados.
    pub profiles: Vec<BrowserProfile>,
    /// Suma total de bytes de caché de todos los perfiles.
    pub total_all_profiles_bytes: u64,
}

/// Un perfil de usuario individual dentro de un navegador.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserProfile {
    /// Nombre del perfil (ej: "Default", "Profile 1").
    pub profile_name: String,
    /// Ruta absoluta al directorio del perfil.
    pub profile_path: String,
    /// Entradas de caché encontradas en este perfil.
    pub cache_entries: Vec<BrowserCacheEntry>,
    /// Suma total de bytes de caché de este perfil.
    pub total_size_bytes: u64,
}

/// Una entrada de caché individual dentro de un perfil.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserCacheEntry {
    /// Tipo de caché: "cache", "code_cache", "gpu_cache", "service_worker".
    pub cache_type: String,
    /// Nombre legible: "Caché principal", "Caché de código", "GPUCache", "Service Worker".
    pub display_name: String,
    /// Ruta absoluta al directorio de caché.
    pub path: String,
    /// Tamaño en bytes del directorio de caché.
    pub size_bytes: u64,
    /// Siempre true para cachés de navegadores (borrado seguro).
    pub safe: bool,
}

// ─────────────────────────── Helpers ──────────────────────────────

/// Calcula el tamaño total de un directorio sumando recursivamente
/// todos los archivos. Ignora errores de permisos silenciosamente.
pub fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total: u64 = 0;
    let mut stack: Vec<PathBuf> = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = match fs::read_dir(&current) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if ft.is_dir() {
                stack.push(entry.path());
            } else if ft.is_file() {
                if let Ok(meta) = entry.metadata() {
                    total += meta.len();
                }
            }
        }
    }
    total
}

// ─────────────────────── Chromium scanning ────────────────────────

/// Definiciones de subcategorías de caché para navegadores Chromium.
const CHROMIUM_CACHE_DIRS: &[(&str, &str, &str)] = &[
    ("Cache",          "cache",          "Caché principal"),
    ("Cache_Data",     "cache",          "Caché principal"),
    ("Code Cache",     "code_cache",     "Caché de código"),
    ("GPUCache",       "gpu_cache",      "GPUCache"),
    ("Service Worker", "service_worker", "Service Worker"),
];

/// Escanea los perfiles de un navegador Chromium a partir de su directorio User Data.
pub fn scan_chromium_profiles(user_data: &Path) -> Vec<BrowserProfile> {
    let mut profiles = Vec::new();
    let entries = match fs::read_dir(user_data) {
        Ok(e) => e,
        Err(_) => return profiles,
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let is_profile = name == "Default"
            || (name.starts_with("Profile ") && name.len() > 8 && name[8..].chars().all(|c| c.is_ascii_digit()));
        if !is_profile {
            continue;
        }
        let profile_path = entry.path();
        if !profile_path.is_dir() {
            continue;
        }

        let mut cache_entries = Vec::new();
        let mut total_size: u64 = 0;

        for &(subdir, cache_type, display_name) in CHROMIUM_CACHE_DIRS {
            let cache_path = profile_path.join(subdir);
            if cache_path.is_dir() {
                let size = dir_size(&cache_path);
                total_size += size;
                cache_entries.push(BrowserCacheEntry {
                    cache_type: cache_type.to_string(),
                    display_name: display_name.to_string(),
                    path: cache_path.to_string_lossy().to_string(),
                    size_bytes: size,
                    safe: true,
                });
            }
        }

        profiles.push(BrowserProfile {
            profile_name: name,
            profile_path: profile_path.to_string_lossy().to_string(),
            cache_entries,
            total_size_bytes: total_size,
        });
    }

    profiles.sort_by(|a, b| {
        if a.profile_name == "Default" {
            std::cmp::Ordering::Less
        } else if b.profile_name == "Default" {
            std::cmp::Ordering::Greater
        } else {
            a.profile_name.cmp(&b.profile_name)
        }
    });

    profiles
}

// ─────────────────────── Firefox scanning ─────────────────────────

const FIREFOX_CACHE_DIRS: &[(&str, &str, &str)] = &[
    ("cache2",       "cache",        "Caché principal"),
    ("shader-cache", "shader_cache", "Shader Cache"),
];

/// Parsea el archivo profiles.ini de Firefox y devuelve una lista
/// de (nombre_perfil, ruta_absoluta_perfil).
pub fn parse_firefox_ini(ini_path: &Path) -> Vec<(String, PathBuf)> {
    let content = match fs::read_to_string(ini_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let parent_dir = ini_path.parent().unwrap_or_else(|| Path::new("."));
    let mut result: Vec<(String, PathBuf)> = Vec::new();

    let mut in_profile = false;
    let mut current_name: Option<String> = None;
    let mut current_path: Option<String> = None;
    let mut is_relative: Option<bool> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            // Flush previous profile
            if in_profile {
                if let (Some(n), Some(p)) = (current_name.take(), current_path.take()) {
                    let rel = is_relative.take().unwrap_or(true);
                    let abs_path = if rel {
                        parent_dir.join(&p)
                    } else {
                        PathBuf::from(&p)
                    };
                    result.push((n, abs_path));
                } else {
                    current_name.take();
                    current_path.take();
                    is_relative.take();
                }
            }
            let section = &trimmed[1..trimmed.len() - 1];
            in_profile = section.starts_with("Profile");
            continue;
        }

        if !in_profile {
            continue;
        }

        if let Some(val) = trimmed.strip_prefix("Name=") {
            current_name = Some(val.to_string());
        } else if let Some(val) = trimmed.strip_prefix("Path=") {
            current_path = Some(val.to_string());
        } else if let Some(val) = trimmed.strip_prefix("IsRelative=") {
            is_relative = Some(val.trim() == "1");
        }
    }

    // Flush last profile
    if in_profile {
        if let (Some(n), Some(p)) = (current_name.take(), current_path.take()) {
            let rel = is_relative.take().unwrap_or(true);
            let abs_path = if rel {
                parent_dir.join(&p)
            } else {
                PathBuf::from(&p)
            };
            result.push((n, abs_path));
        }
    }

    result
}

/// Escanea los perfiles de Firefox a partir del directorio de perfiles.
pub fn scan_firefox_profiles(profiles_dir: &Path) -> Vec<BrowserProfile> {
    let firefox_dir = profiles_dir.parent().unwrap_or(profiles_dir);
    let ini_path = firefox_dir.join("profiles.ini");

    let parsed = parse_firefox_ini(&ini_path);
    let mut profiles = Vec::new();

    for (name, abs_path) in parsed {
        if !abs_path.is_dir() {
            continue;
        }

        let mut cache_entries = Vec::new();
        let mut total_size: u64 = 0;

        for &(subdir, cache_type, display_name) in FIREFOX_CACHE_DIRS {
            let cache_path = abs_path.join(subdir);
            if cache_path.is_dir() {
                let size = dir_size(&cache_path);
                total_size += size;
                cache_entries.push(BrowserCacheEntry {
                    cache_type: cache_type.to_string(),
                    display_name: display_name.to_string(),
                    path: cache_path.to_string_lossy().to_string(),
                    size_bytes: size,
                    safe: true,
                });
            }
        }

        profiles.push(BrowserProfile {
            profile_name: name,
            profile_path: abs_path.to_string_lossy().to_string(),
            cache_entries,
            total_size_bytes: total_size,
        });
    }

    profiles
}

// ─────────────────────── Browser definitions ──────────────────────

struct BrowserDef {
    name: &'static str,
    id: &'static str,
    base_path: fn() -> Option<PathBuf>,
    kind: BrowserKind,
}

enum BrowserKind {
    Chromium,
    Firefox,
}

fn browser_defs() -> Vec<BrowserDef> {
    vec![
        BrowserDef {
            name: "Google Chrome",
            id: "chrome",
            base_path: || {
                std::env::var("LOCALAPPDATA").ok().map(|la| {
                    PathBuf::from(la)
                        .join("Google")
                        .join("Chrome")
                        .join("User Data")
                })
            },
            kind: BrowserKind::Chromium,
        },
        BrowserDef {
            name: "Microsoft Edge",
            id: "edge",
            base_path: || {
                std::env::var("LOCALAPPDATA").ok().map(|la| {
                    PathBuf::from(la)
                        .join("Microsoft")
                        .join("Edge")
                        .join("User Data")
                })
            },
            kind: BrowserKind::Chromium,
        },
        BrowserDef {
            name: "Brave",
            id: "brave",
            base_path: || {
                std::env::var("LOCALAPPDATA").ok().map(|la| {
                    PathBuf::from(la)
                        .join("BraveSoftware")
                        .join("Brave-Browser")
                        .join("User Data")
                })
            },
            kind: BrowserKind::Chromium,
        },
        BrowserDef {
            name: "Opera",
            id: "opera",
            base_path: || {
                std::env::var("APPDATA").ok().map(|ad| {
                    PathBuf::from(ad)
                        .join("Opera Software")
                        .join("Opera Stable")
                })
            },
            kind: BrowserKind::Chromium,
        },
        BrowserDef {
            name: "Vivaldi",
            id: "vivaldi",
            base_path: || {
                std::env::var("LOCALAPPDATA").ok().map(|la| {
                    PathBuf::from(la)
                        .join("Vivaldi")
                        .join("User Data")
                })
            },
            kind: BrowserKind::Chromium,
        },
        BrowserDef {
            name: "Mozilla Firefox",
            id: "firefox",
            base_path: || {
                std::env::var("LOCALAPPDATA").ok().map(|la| {
                    PathBuf::from(la)
                        .join("Mozilla")
                        .join("Firefox")
                        .join("Profiles")
                })
            },
            kind: BrowserKind::Firefox,
        },
    ]
}

// ─────────────────────── Public API ───────────────────────────────

/// Escanea las cachés de todos los navegadores soportados.
pub fn scan_browser_caches() -> Vec<BrowserCacheProfile> {
    let defs = browser_defs();
    let mut results = Vec::with_capacity(defs.len());

    for def in defs {
        let base = match (def.base_path)() {
            Some(p) => p,
            None => {
                results.push(BrowserCacheProfile {
                    browser_name: def.name.to_string(),
                    browser_id: def.id.to_string(),
                    installed: false,
                    profiles: Vec::new(),
                    total_all_profiles_bytes: 0,
                });
                continue;
            }
        };

        let installed = base.is_dir();

        let profiles = if installed {
            match def.kind {
                BrowserKind::Chromium => {
                    if def.id == "opera" {
                        scan_opera_profile(&base)
                    } else {
                        scan_chromium_profiles(&base)
                    }
                }
                BrowserKind::Firefox => scan_firefox_profiles(&base),
            }
        } else {
            Vec::new()
        };

        let total: u64 = profiles.iter().map(|p| p.total_size_bytes).sum();

        results.push(BrowserCacheProfile {
            browser_name: def.name.to_string(),
            browser_id: def.id.to_string(),
            installed,
            profiles,
            total_all_profiles_bytes: total,
        });
    }

    results
}

/// Opera no sigue la convención estándar de Chromium. Su directorio base ES el perfil.
fn scan_opera_profile(base: &Path) -> Vec<BrowserProfile> {
    let mut cache_entries = Vec::new();
    let mut total_size: u64 = 0;

    for &(subdir, cache_type, display_name) in CHROMIUM_CACHE_DIRS {
        let cache_path = base.join(subdir);
        if cache_path.is_dir() {
            let size = dir_size(&cache_path);
            total_size += size;
            cache_entries.push(BrowserCacheEntry {
                cache_type: cache_type.to_string(),
                display_name: display_name.to_string(),
                path: cache_path.to_string_lossy().to_string(),
                size_bytes: size,
                safe: true,
            });
        }
    }

    if cache_entries.is_empty() {
        return Vec::new();
    }

    vec![BrowserProfile {
        profile_name: "Default".to_string(),
        profile_path: base.to_string_lossy().to_string(),
        cache_entries,
        total_size_bytes: total_size,
    }]
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_scan_browser_caches_runs() {
        let results = scan_browser_caches();
        assert_eq!(results.len(), 6);
        for browser in &results {
            assert!(!browser.browser_name.is_empty());
            assert!(!browser.browser_id.is_empty());
            if browser.installed {
                let sum: u64 = browser.profiles.iter().map(|p| p.total_size_bytes).sum();
                assert_eq!(browser.total_all_profiles_bytes, sum);
            } else {
                assert!(browser.profiles.is_empty());
                assert_eq!(browser.total_all_profiles_bytes, 0);
            }
        }
    }

    #[test]
    fn test_dir_size_empty() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(dir_size(tmp.path()), 0);
    }

    #[test]
    fn test_dir_size_with_files() {
        let tmp = tempfile::tempdir().unwrap();
        let f1 = tmp.path().join("a.txt");
        let sub = tmp.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let f2 = sub.join("b.txt");
        fs::write(&f1, "hello").unwrap();
        fs::write(&f2, "world!!").unwrap();
        assert_eq!(dir_size(tmp.path()), 12);
    }

    #[test]
    fn test_dir_size_nonexistent() {
        assert_eq!(dir_size(Path::new("C:\\nonexistent_path_xyz_123")), 0);
    }

    #[test]
    fn test_parse_firefox_ini_valid() {
        let tmp = tempfile::tempdir().unwrap();
        let ini_content = "[General]\nStartWithLastProfile=1\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abc123.default-release\nDefault=1\n\n[Profile1]\nName=work\nIsRelative=0\nPath=C:\\Users\\Test\\FirefoxWork\n\n[Install308046B0AF4A39CB]\nDefault=Profiles/abc123.default-release\n";
        let ini_path = tmp.path().join("profiles.ini");
        fs::write(&ini_path, ini_content).unwrap();

        let profiles = parse_firefox_ini(&ini_path);
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].0, "default-release");
        assert_eq!(profiles[1].0, "work");
    }

    #[test]
    fn test_parse_firefox_ini_missing_file() {
        let result = parse_firefox_ini(Path::new("C:\\nonexistent\\profiles.ini"));
        assert!(result.is_empty());
    }

    #[test]
    fn test_scan_chromium_profiles_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let profiles = scan_chromium_profiles(tmp.path());
        assert!(profiles.is_empty());
    }

    #[test]
    fn test_scan_chromium_profiles_with_default() {
        let tmp = tempfile::tempdir().unwrap();
        let default_dir = tmp.path().join("Default");
        fs::create_dir(&default_dir).unwrap();
        let cache_dir = default_dir.join("Cache");
        fs::create_dir(&cache_dir).unwrap();
        fs::write(cache_dir.join("data.bin"), "0123456789").unwrap();

        let profiles = scan_chromium_profiles(tmp.path());
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].profile_name, "Default");
        assert_eq!(profiles[0].total_size_bytes, 10);
        assert_eq!(profiles[0].cache_entries.len(), 1);
        assert_eq!(profiles[0].cache_entries[0].cache_type, "cache");
        assert!(profiles[0].cache_entries[0].safe);
    }

    #[test]
    fn test_scan_chromium_profiles_multiple() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("Default")).unwrap();
        fs::create_dir(tmp.path().join("Profile 1")).unwrap();
        fs::create_dir(tmp.path().join("Crashpad")).unwrap();

        let profiles = scan_chromium_profiles(tmp.path());
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].profile_name, "Default");
        assert_eq!(profiles[1].profile_name, "Profile 1");
    }

    #[test]
    fn test_browser_cache_entry_serialize() {
        let entry = BrowserCacheEntry {
            cache_type: "cache".to_string(),
            display_name: "Caché principal".to_string(),
            path: "C:\\test".to_string(),
            size_bytes: 1024,
            safe: true,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("cache"));
        let de: BrowserCacheEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(de.size_bytes, 1024);
        assert!(de.safe);
    }

    #[test]
    fn test_scan_firefox_profiles_no_ini() {
        let tmp = tempfile::tempdir().unwrap();
        let profiles_dir = tmp.path().join("Profiles");
        fs::create_dir(&profiles_dir).unwrap();
        let profiles = scan_firefox_profiles(&profiles_dir);
        assert!(profiles.is_empty());
    }

    #[test]
    fn test_scan_firefox_profiles_with_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let firefox_dir = tmp.path().join("Firefox");
        fs::create_dir(&firefox_dir).unwrap();
        let profiles_dir = firefox_dir.join("Profiles");
        fs::create_dir(&profiles_dir).unwrap();

        let profile_path = profiles_dir.join("abc.default");
        fs::create_dir(&profile_path).unwrap();
        let cache2 = profile_path.join("cache2");
        fs::create_dir(&cache2).unwrap();
        fs::write(cache2.join("entries"), "cached data here!").unwrap();

        let ini_content = "[Profile0]\nName=default\nIsRelative=1\nPath=Profiles/abc.default\n";
        fs::write(firefox_dir.join("profiles.ini"), ini_content).unwrap();

        let profiles = scan_firefox_profiles(&profiles_dir);
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].profile_name, "default");
        assert!(!profiles[0].cache_entries.is_empty());
        assert!(profiles[0].total_size_bytes > 0);
    }
}