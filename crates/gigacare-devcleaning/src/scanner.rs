use std::path::{Path, PathBuf};
use std::time::SystemTime;
use sysinfo::Disks;

use crate::models::{DevChildEntry, DevCleanReport, DevFinding};
use crate::rules::all_rules;

#[derive(Debug, Clone, Default)]
pub struct DirStats {
    pub size: u64,
    pub files: u64,
    pub newest_mtime: Option<SystemTime>,
    pub read_error: Option<String>,
}

pub fn measure_dir(path: &Path) -> DirStats {
    let mut stats = DirStats::default();

    for entry in jwalk::WalkDir::new(path).skip_hidden(false) {
        match entry {
            Ok(e) => {
                if let Ok(meta) = e.metadata() {
                    if meta.is_file() {
                        stats.size += meta.len();
                        stats.files += 1;
                    }
                    if let Ok(modified) = meta.modified() {
                        match stats.newest_mtime {
                            None => stats.newest_mtime = Some(modified),
                            Some(cur) => {
                                if modified > cur {
                                    stats.newest_mtime = Some(modified);
                                }
                            }
                        }
                    }
                }
            }
            Err(err) => {
                if stats.read_error.is_none() {
                    stats.read_error = Some(err.to_string());
                }
            }
        }
    }

    stats
}

pub fn shallow_size(path: &Path) -> u64 {
    if let Ok(meta) = path.symlink_metadata() {
        if meta.is_file() {
            return meta.len();
        }
    }

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

pub fn top_children(path: &Path, limit: usize) -> Vec<DevChildEntry> {
    let entries = match std::fs::read_dir(path) {
        Ok(read_dir) => read_dir,
        Err(_) => return Vec::new(),
    };

    let mut children = Vec::new();
    for entry_res in entries {
        if let Ok(entry) = entry_res {
            let child_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let size_bytes = shallow_size(&child_path);
            if size_bytes > 0 {
                children.push(DevChildEntry {
                    name,
                    path: child_path.to_string_lossy().to_string(),
                    size_bytes,
                });
            }
        }
    }

    children.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    children.truncate(limit);
    children
}

pub fn disk_totals() -> (u64, u64) {
    let disks = Disks::new_with_refreshed_list();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

    // Find the disk matching home_dir best (longest prefix)
    let mut matched_disk = None;
    let mut max_len = 0;

    for disk in disks.list() {
        let mount = disk.mount_point();
        if home.starts_with(mount) {
            let len = mount.as_os_str().len();
            if len >= max_len {
                max_len = len;
                matched_disk = Some(disk);
            }
        }
    }

    if let Some(disk) = matched_disk.or_else(|| disks.list().first()) {
        (disk.total_space(), disk.available_space())
    } else {
        (0, 0)
    }
}

pub fn scan_dev_caches() -> DevCleanReport {
    let rules = all_rules();
    let mut findings = Vec::new();
    let now = SystemTime::now();

    for rule in rules {
        for path in rule.paths() {
            if !path.exists() {
                continue;
            }

            let stats = measure_dir(&path);
            if stats.size == 0 && stats.files == 0 && stats.read_error.is_none() {
                continue;
            }

            let stale_days = stats.newest_mtime.and_then(|mtime| {
                now.duration_since(mtime)
                    .ok()
                    .map(|d| d.as_secs() / 86400)
            });

            let children = top_children(&path, 8);

            findings.push(DevFinding {
                rule_id: rule.id.to_string(),
                name: rule.name.to_string(),
                description: rule.description.to_string(),
                category: rule.category,
                safety: rule.safety,
                path: path.to_string_lossy().to_string(),
                size_bytes: stats.size,
                file_count: stats.files,
                stale_days,
                children,
                read_error: stats.read_error,
            });
        }
    }

    findings.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let (disk_total, disk_free) = disk_totals();

    DevCleanReport {
        disk_total,
        disk_free,
        findings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disk_totals() {
        let (total, free) = disk_totals();
        assert!(total > 0, "disk_total should be > 0");
        assert!(free <= total, "disk_free should be <= disk_total");
    }


}
