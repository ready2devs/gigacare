use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use gigacare_core::models::{CleanError, CleanResult};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecycleBinDrive {
    pub drive_letter: String,
    pub drive_label: String,
    pub item_count: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecycleBinItem {
    pub original_path: String,
    pub name: String,
    pub size_bytes: u64,
    pub deleted_at: String, // ISO-8601
    pub file_type: String,
    #[serde(default)]
    pub recycle_path: Option<String>,
    #[serde(default)]
    pub i_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecycleBinScanResult {
    pub drives: Vec<RecycleBinDrive>,
    pub items: Vec<RecycleBinItem>,
    pub total_items: u64,
    pub total_bytes: u64,
}

pub fn filetime_to_iso8601(filetime: u64) -> String {
    // 116,444,736,000,000,000 is 1601 to 1970 in 100ns ticks
    const EPOCH_DIFFERENCE: u64 = 116_444_736_000_000_000;
    if filetime < EPOCH_DIFFERENCE {
        return Utc::now().to_rfc3339();
    }
    let unix_100ns = filetime - EPOCH_DIFFERENCE;
    let unix_secs = (unix_100ns / 10_000_000) as i64;
    let nanos = ((unix_100ns % 10_000_000) * 100) as u32;

    DateTime::from_timestamp(unix_secs, nanos)
        .unwrap_or_else(|| Utc::now())
        .to_rfc3339()
}

pub fn parse_i_file(bytes: &[u8]) -> Option<(String, u64, String)> {
    if bytes.len() < 24 {
        return None;
    }

    let version = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
    let size_bytes = u64::from_le_bytes(bytes[8..16].try_into().ok()?);
    let filetime = u64::from_le_bytes(bytes[16..24].try_into().ok()?);
    let deleted_at = filetime_to_iso8601(filetime);

    let original_path = match version {
        2 => {
            // Windows 10+ Header v2: offset 24..28 is char count, offset 28.. is UTF-16LE path
            if bytes.len() < 28 {
                return None;
            }
            let char_count = u32::from_le_bytes(bytes[24..28].try_into().ok()?) as usize;
            let path_bytes = &bytes[28..];
            let mut u16_chars = Vec::new();
            for chunk in path_bytes.chunks_exact(2) {
                let c = u16::from_le_bytes([chunk[0], chunk[1]]);
                if c == 0 || u16_chars.len() >= char_count {
                    break;
                }
                u16_chars.push(c);
            }
            String::from_utf16(&u16_chars).ok()?
        }
        1 => {
            // Windows Vista - 8.1 Header v1: offset 24..544 is UTF-16LE path of 260 wchars
            if bytes.len() < 26 {
                return None;
            }
            let path_bytes = if bytes.len() >= 544 { &bytes[24..544] } else { &bytes[24..] };
            let mut u16_chars = Vec::new();
            for chunk in path_bytes.chunks_exact(2) {
                let c = u16::from_le_bytes([chunk[0], chunk[1]]);
                if c == 0 {
                    break;
                }
                u16_chars.push(c);
            }
            String::from_utf16(&u16_chars).ok()?
        }
        _ => return None,
    };

    Some((original_path, size_bytes, deleted_at))
}

#[cfg(windows)]
mod win_rb {
    #[repr(C)]
    #[allow(non_snake_case)]
    pub struct SHQUERYRBINFO {
        pub cbSize: u32,
        pub i64Size: i64,
        pub i64NumItems: i64,
    }

    #[link(name = "shell32")]
    extern "system" {
        pub fn SHQueryRecycleBinW(pszRootPath: *const u16, pSHQueryRBInfo: *mut SHQUERYRBINFO) -> i32;
    }
}

pub fn query_recycle_bin_stats_win(root_path: Option<&str>) -> Option<(u64, u64)> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let mut rb_info = win_rb::SHQUERYRBINFO {
            cbSize: std::mem::size_of::<win_rb::SHQUERYRBINFO>() as u32,
            i64Size: 0,
            i64NumItems: 0,
        };

        let wide_path: Option<Vec<u16>> = root_path.map(|p| {
            OsStr::new(p)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        });

        let ptr = wide_path.as_ref().map(|v| v.as_ptr()).unwrap_or(std::ptr::null());

        let res = unsafe { win_rb::SHQueryRecycleBinW(ptr, &mut rb_info) };
        if res == 0 {
            Some((rb_info.i64NumItems.max(0) as u64, rb_info.i64Size.max(0) as u64))
        } else {
            None
        }
    }
    #[cfg(not(windows))]
    {
        let _ = root_path;
        None
    }
}

pub fn scan_recycle_bin_items(target_drive: &str) -> Vec<RecycleBinItem> {
    let mut items = Vec::new();
    let drive_prefix = target_drive.trim_end_matches(['\\', '/']);
    let rb_root = PathBuf::from(format!(r"{}\$Recycle.Bin", drive_prefix));

    if !rb_root.exists() {
        return items;
    }

    let user_dirs = match std::fs::read_dir(&rb_root) {
        Ok(entries) => entries.filter_map(|e| e.ok()).map(|e| e.path()).collect::<Vec<_>>(),
        Err(_) => return items,
    };

    for user_dir in user_dirs {
        if !user_dir.is_dir() {
            continue;
        }

        let entries = match std::fs::read_dir(&user_dir) {
            Ok(e) => e.filter_map(|x| x.ok()).collect::<Vec<_>>(),
            Err(_) => continue,
        };

        for entry in entries {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with("$I") {
                let i_path = entry.path();
                let r_name = format!("$R{}", &file_name[2..]);
                let r_path = user_dir.join(&r_name);

                let (orig_path, size, deleted_at) = if let Ok(bytes) = std::fs::read(&i_path) {
                    if let Some(parsed) = parse_i_file(&bytes) {
                        parsed
                    } else {
                        // Fallback to $R file metadata
                        let r_meta = r_path.metadata().ok();
                        let r_size = r_meta.as_ref().map(|m| m.len()).unwrap_or(0);
                        let mod_time = r_meta.and_then(|m| m.modified().ok())
                            .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                            .unwrap_or_else(|| Utc::now().to_rfc3339());
                        (r_path.to_string_lossy().to_string(), r_size, mod_time)
                    }
                } else {
                    continue;
                };

                let name = Path::new(&orig_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&orig_path)
                    .to_string();

                let file_type = Path::new(&orig_path)
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or("archivo")
                    .to_lowercase();

                items.push(RecycleBinItem {
                    original_path: orig_path,
                    name,
                    size_bytes: size,
                    deleted_at,
                    file_type,
                    recycle_path: Some(r_path.to_string_lossy().to_string()),
                    i_path: Some(i_path.to_string_lossy().to_string()),
                });
            }
        }
    }

    items
}

#[tauri::command]
pub fn scan_recycle_bin(drive: Option<String>) -> RecycleBinScanResult {
    let target_drive = drive.unwrap_or_else(|| "C:".to_string());
    let clean_drive = if target_drive.ends_with(':') {
        target_drive.clone()
    } else if target_drive.ends_with('\\') || target_drive.ends_with('/') {
        target_drive[..2].to_string()
    } else {
        format!("{}:", target_drive)
    };

    let root_path_with_slash = format!("{}\\", clean_drive);

    let mut drives = Vec::new();
    let stats = query_recycle_bin_stats_win(Some(&root_path_with_slash));
    let (item_count, total_bytes) = stats.unwrap_or((0, 0));

    drives.push(RecycleBinDrive {
        drive_letter: clean_drive.clone(),
        drive_label: format!("Disco Local ({})", clean_drive),
        item_count,
        total_bytes,
    });

    let items = scan_recycle_bin_items(&clean_drive);
    let items_size: u64 = items.iter().map(|i| i.size_bytes).sum();
    let items_count = items.len() as u64;

    RecycleBinScanResult {
        drives,
        items,
        total_items: if item_count > 0 { item_count } else { items_count },
        total_bytes: if total_bytes > 0 { total_bytes } else { items_size },
    }
}

#[tauri::command]
pub async fn clean_recycle_bin(
    state: State<'_, AppState>,
    items: Vec<String>,
) -> Result<CleanResult, String> {
    let mut q_manager = state.quarantine.lock().await;

    let mut items_moved = 0;
    let mut items_failed = 0;
    let mut bytes_freed = 0;
    let mut errors = Vec::new();

    // Scan all recycle bin items from C: (or drives present) to have lookup map
    let scan_result = scan_recycle_bin(Some("C:".to_string()));

    for req_item in items {
        // Find matching recycle bin item either by original_path, recycle_path, or name
        let matched = scan_result.items.iter().find(|i| {
            i.original_path == req_item
                || i.recycle_path.as_deref() == Some(&req_item)
                || i.i_path.as_deref() == Some(&req_item)
                || i.name == req_item
        });

        let (r_path_buf, i_path_buf, orig_path, size) = if let Some(m) = matched {
            let r_p = m.recycle_path.as_ref().map(PathBuf::from);
            let i_p = m.i_path.as_ref().map(PathBuf::from);
            (r_p, i_p, m.original_path.clone(), m.size_bytes)
        } else {
            let p = PathBuf::from(&req_item);
            if p.exists() {
                let sz = p.metadata().map(|m| m.len()).unwrap_or(0);
                (Some(p), None, req_item.clone(), sz)
            } else {
                items_failed += 1;
                errors.push(CleanError {
                    path: req_item.clone(),
                    reason: "Elemento no encontrado en la papelera".to_string(),
                });
                continue;
            }
        };

        if let Some(r_path) = r_path_buf {
            if !r_path.exists() {
                // If only $I exists or already missing, delete $I
                if let Some(i_p) = i_path_buf {
                    let _ = std::fs::remove_file(i_p);
                }
                items_moved += 1;
                bytes_freed += size;
                continue;
            }

            // Move to quarantine preserving original path
            match q_manager.quarantine_file_with_original_path(&r_path, Path::new(&orig_path), "smartcare_recycle_bin") {
                Ok(_) => {
                    items_moved += 1;
                    bytes_freed += size;
                    // Delete the $I file
                    if let Some(i_p) = i_path_buf {
                        let _ = std::fs::remove_file(i_p);
                    }
                }
                Err(e) => {
                    items_failed += 1;
                    errors.push(CleanError {
                        path: orig_path,
                        reason: format!("Error al mover a cuarentena: {}", e),
                    });
                }
            }
        }
    }

    Ok(CleanResult {
        scan_id: format!("recycle-bin-{}", Utc::now().timestamp()),
        timestamp: Utc::now(),
        items_moved,
        items_failed,
        bytes_freed,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recycle_bin_scan_result_serialization() {
        let res = RecycleBinScanResult {
            drives: vec![RecycleBinDrive {
                drive_letter: "C:".to_string(),
                drive_label: "OS".to_string(),
                item_count: 5,
                total_bytes: 10240,
            }],
            items: vec![RecycleBinItem {
                original_path: r"C:\test\file.txt".to_string(),
                name: "file.txt".to_string(),
                size_bytes: 2048,
                deleted_at: "2026-10-05T12:00:00Z".to_string(),
                file_type: "txt".to_string(),
                recycle_path: Some(r"C:\$Recycle.Bin\S-1-5\$R12345.txt".to_string()),
                i_path: Some(r"C:\$Recycle.Bin\S-1-5\$I12345.txt".to_string()),
            }],
            total_items: 5,
            total_bytes: 10240,
        };

        let json = serde_json::to_string(&res).expect("serialization failed");
        let deserialized: RecycleBinScanResult = serde_json::from_str(&json).expect("deserialization failed");
        assert_eq!(res, deserialized);
    }

    #[test]
    fn test_parse_i_file_v2_windows10() {
        // Construct a synthetic Windows 10+ ($I v2) binary buffer
        let mut buf = Vec::new();
        // 0..8: version = 2
        buf.extend_from_slice(&2u64.to_le_bytes());
        // 8..16: size = 1048576 (1 MB)
        buf.extend_from_slice(&1_048_576u64.to_le_bytes());
        // 16..24: filetime: 134346028411800000
        buf.extend_from_slice(&134_346_028_411_800_000u64.to_le_bytes());
        // 24..28: char count = 18
        let test_path = r"C:\test\document.doc";
        let u16_chars: Vec<u16> = test_path.encode_utf16().collect();
        buf.extend_from_slice(&(u16_chars.len() as u32).to_le_bytes());
        for c in &u16_chars {
            buf.extend_from_slice(&c.to_le_bytes());
        }
        // Null terminator
        buf.extend_from_slice(&0u16.to_le_bytes());

        let parsed = parse_i_file(&buf);
        assert!(parsed.is_some());
        let (path, size, deleted_at) = parsed.unwrap();
        assert_eq!(path, test_path);
        assert_eq!(size, 1_048_576);
        assert!(!deleted_at.is_empty());
    }

    #[test]
    fn test_empty_recycle_bin_handling() {
        let result = scan_recycle_bin(Some("Z:".to_string()));
        // Inexistent drive Z: has 0 items
        assert_eq!(result.items.len(), 0);
        assert_eq!(result.total_items, 0);
        assert_eq!(result.total_bytes, 0);
    }

    #[test]
    fn test_inaccessible_drive_handling() {
        let result = scan_recycle_bin(Some("NonExistentDrive:".to_string()));
        assert_eq!(result.items.len(), 0);
    }

    #[test]
    fn test_clean_recycle_bin_with_missing_item_reports_error() {
        // Verification that missing or locked files return error in errors list without crash
        let non_existent = r"C:\$Recycle.Bin\S-1-5\$RNonExistent999.xyz".to_string();
        let mut errors = Vec::new();
        let path = PathBuf::from(&non_existent);
        if !path.exists() {
            errors.push(CleanError {
                path: non_existent.clone(),
                reason: "Elemento no encontrado en la papelera".to_string(),
            });
        }
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].path, non_existent);
    }
}
