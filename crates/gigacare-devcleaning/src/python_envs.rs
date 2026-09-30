use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::models::{PyDuplicate, PyEnv, PyPackage, PyReport};

pub const MAX_DEPTH: usize = 6;

pub fn skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".git"
            | ".Trash"
            | "Library"
            | "Applications"
            | ".cache"
            | "Pictures"
            | "Music"
            | "Movies"
            | "Photos Library.photoslibrary"
            | "AppData"
            | "$Recycle.Bin"
            | "System Volume Information"
    )
}

pub fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    for entry in jwalk::WalkDir::new(path).skip_hidden(false) {
        if let Ok(e) = entry {
            if let Ok(meta) = e.metadata() {
                if meta.is_file() {
                    total += meta.len();
                }
            }
        }
    }
    total
}

pub fn newest_mtime(path: &Path) -> Option<SystemTime> {
    let mut newest = None;
    for entry in jwalk::WalkDir::new(path).max_depth(3).skip_hidden(false) {
        if let Ok(e) = entry {
            if let Ok(meta) = e.metadata() {
                if let Ok(m) = meta.modified() {
                    match newest {
                        None => newest = Some(m),
                        Some(cur) => {
                            if m > cur {
                                newest = Some(m);
                            }
                        }
                    }
                }
            }
        }
    }
    newest
}

pub fn find_envs(home: &Path) -> Vec<(PathBuf, String)> {
    let mut envs = Vec::new();
    let mut seen = HashSet::new();

    let walker = jwalk::WalkDir::new(home)
        .max_depth(MAX_DEPTH)
        .skip_hidden(false)
        .process_read_dir(|_depth, _path, _read_dir_state, children| {
            children.retain(|dir_entry_result| {
                if let Ok(entry) = dir_entry_result {
                    let file_name = entry.file_name();
                    let name = file_name.to_string_lossy();
                    !skip_dir(&name)
                } else {
                    false
                }
            });
        });

    for entry_res in walker {
        if let Ok(entry) = entry_res {
            let path = entry.path();
            if path.is_dir() {
                if path.join("pyvenv.cfg").exists() {
                    if seen.insert(path.clone()) {
                        envs.push((path, "virtualenv".to_string()));
                    }
                } else if path.join("conda-meta").is_dir() {
                    if seen.insert(path.clone()) {
                        envs.push((path, "conda".to_string()));
                    }
                }
            }
        }
    }

    envs
}

pub fn site_packages_dirs(env: &Path) -> Vec<PathBuf> {
    let mut res = Vec::new();

    // Windows layout: Lib/site-packages
    let win_sp = env.join("Lib").join("site-packages");
    if win_sp.is_dir() {
        res.push(win_sp);
    }
    let win_sp_lower = env.join("lib").join("site-packages");
    if win_sp_lower.is_dir() && !res.contains(&win_sp_lower) {
        res.push(win_sp_lower);
    }

    // Unix layout: lib/python3.*/site-packages
    let unix_lib = env.join("lib");
    if unix_lib.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&unix_lib) {
            for entry_res in entries.flatten() {
                let name = entry_res.file_name().to_string_lossy().to_string();
                if name.starts_with("python") {
                    let sp = entry_res.path().join("site-packages");
                    if sp.is_dir() && !res.contains(&sp) {
                        res.push(sp);
                    }
                }
            }
        }
    }

    res
}

pub fn package_name(entry_name: &str) -> Option<String> {
    if entry_name.starts_with('.') || entry_name == "__pycache__" {
        return None;
    }

    let mut name = entry_name;
    if let Some(stripped) = name.strip_suffix(".dist-info") {
        name = stripped;
    } else if let Some(stripped) = name.strip_suffix(".egg-info") {
        name = stripped;
    } else if let Some(stripped) = name.strip_suffix(".py") {
        name = stripped;
    }

    // Strip trailing version like -2.4.0 or -1.0.0b1
    if let Some(pos) = name.find('-') {
        name = &name[..pos];
    }

    let normalized = name.trim().to_lowercase();
    if normalized.is_empty() || normalized == "__pycache__" {
        None
    } else {
        Some(normalized)
    }
}

pub fn scan_python_envs() -> PyReport {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            return PyReport {
                total_bytes: 0,
                wasted_bytes: 0,
                envs: Vec::new(),
                duplicates: Vec::new(),
            };
        }
    };

    let detected = find_envs(&home);
    let now = SystemTime::now();
    let mut envs = Vec::new();
    let mut cross_env_packages: HashMap<String, Vec<u64>> = HashMap::new();

    for (env_path, kind) in detected {
        let name = {
            let dir_name = env_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "env".to_string());
            if matches!(dir_name.as_str(), ".venv" | "venv" | "env" | ".env") {
                if let Some(parent) = env_path.parent().and_then(|p| p.file_name()) {
                    format!("{} ({})", parent.to_string_lossy(), dir_name)
                } else {
                    dir_name
                }
            } else {
                dir_name
            }
        };

        let size_bytes = dir_size(&env_path);
        let mtime = newest_mtime(&env_path);
        let stale_days = mtime.and_then(|t| {
            now.duration_since(t).ok().map(|d| d.as_secs() / 86400)
        });

        // Scan site-packages
        let sp_dirs = site_packages_dirs(&env_path);
        let mut package_sizes: HashMap<String, (u64, PathBuf)> = HashMap::new();

        for sp in sp_dirs {
            if let Ok(entries) = std::fs::read_dir(&sp) {
                for entry_res in entries.flatten() {
                    let entry_path = entry_res.path();
                    let file_name = entry_res.file_name().to_string_lossy().to_string();

                    if let Some(pkg_name) = package_name(&file_name) {
                        let item_size = if entry_path.is_dir() {
                            dir_size(&entry_path)
                        } else {
                            entry_path.symlink_metadata().map(|m| m.len()).unwrap_or(0)
                        };

                        let entry = package_sizes
                            .entry(pkg_name)
                            .or_insert((0, entry_path.clone()));
                        entry.0 += item_size;
                    }
                }
            }
        }

        let mut packages = Vec::new();
        for (pkg_name, (pkg_size, rep_path)) in package_sizes {
            cross_env_packages
                .entry(pkg_name.clone())
                .or_default()
                .push(pkg_size);

            packages.push(PyPackage {
                name: pkg_name,
                path: rep_path.to_string_lossy().to_string(),
                size_bytes: pkg_size,
            });
        }

        packages.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        packages.truncate(30);

        envs.push(PyEnv {
            name,
            path: env_path.to_string_lossy().to_string(),
            kind,
            size_bytes,
            stale_days,
            packages,
        });
    }

    envs.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let mut duplicates = Vec::new();
    for (name, sizes) in cross_env_packages {
        if sizes.len() > 1 {
            let copies = sizes.len();
            let total: u64 = sizes.iter().sum();
            let max: u64 = *sizes.iter().max().unwrap_or(&0);
            let wasted = total.saturating_sub(max);

            duplicates.push(PyDuplicate {
                name,
                copies,
                total_bytes: total,
                wasted_bytes: wasted,
            });
        }
    }

    duplicates.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));
    duplicates.truncate(25);

    let total_bytes = envs.iter().map(|e| e.size_bytes).sum();
    let wasted_bytes = duplicates.iter().map(|d| d.wasted_bytes).sum();

    PyReport {
        total_bytes,
        wasted_bytes,
        envs,
        duplicates,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_name_normalization() {
        assert_eq!(package_name("torch-2.4.0.dist-info"), Some("torch".to_string()));
        assert_eq!(package_name("numpy"), Some("numpy".to_string()));
        assert_eq!(package_name("numpy-1.26.4.egg-info"), Some("numpy".to_string()));
        assert_eq!(package_name("typing_extensions.py"), Some("typing_extensions".to_string()));
        assert_eq!(package_name("__pycache__"), None);
        assert_eq!(package_name(".pytest_cache"), None);
    }
}
