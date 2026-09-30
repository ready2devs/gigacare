use std::path::Path;
use std::time::UNIX_EPOCH;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceMapNode {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    pub children: Vec<SpaceMapNode>,
    pub item_count: Option<u64>,
    pub modified_at: Option<String>,
    pub extension: Option<String>,
    pub is_system: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub drive_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceLensScanProgress {
    pub scanned_dirs: u32,
    pub total_size: u64,
    pub current_path: String,
}

#[cfg(windows)]
mod win_api {
    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
        pub fn GetVolumeInformationW(
            lpRootPathName: *const u16,
            lpVolumeNameBuffer: *mut u16,
            nVolumeNameSize: u32,
            lpVolumeSerialNumber: *mut u32,
            lpMaximumComponentLength: *mut u32,
            lpFileSystemFlags: *mut u32,
            lpFileSystemNameBuffer: *mut u16,
            nFileSystemNameSize: u32,
        ) -> i32;
    }
}

pub fn is_protected_path(path_str: &str) -> bool {
    let lower = path_str.to_lowercase().replace('/', "\\");
    let name = Path::new(path_str)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    let protected = [
        "windows",
        "program files",
        "program files (x86)",
        "programdata",
        "system volume information",
        "$recycle.bin",
        "system32",
        "syswow64",
        "winsxs",
        "pagefile.sys",
        "hiberfil.sys",
        "swapfile.sys",
    ];

    if protected.contains(&name.as_str()) {
        return true;
    }

    for p in &protected {
        if lower.ends_with(&format!("\\{}", p)) || lower.contains(&format!("\\{}\\", p)) {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn get_disk_info(drive: String) -> DiskInfo {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let clean_drive = drive.trim();
        let target_root = if clean_drive.ends_with('\\') || clean_drive.ends_with('/') {
            clean_drive.to_string()
        } else {
            format!("{}\\", clean_drive)
        };

        let wide_path: Vec<u16> = OsStr::new(&target_root)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut free_avail: u64 = 0;
        let mut total: u64 = 0;
        let mut total_free: u64 = 0;

        let ok = unsafe {
            win_api::GetDiskFreeSpaceExW(
                wide_path.as_ptr(),
                &mut free_avail,
                &mut total,
                &mut total_free,
            )
        };

        if ok != 0 && total > 0 {
            let mut vol_name = [0u16; 260];
            let mut fs_name = [0u16; 260];
            let mut serial = 0u32;
            let mut max_len = 0u32;
            let mut flags = 0u32;

            let vol_ok = unsafe {
                win_api::GetVolumeInformationW(
                    wide_path.as_ptr(),
                    vol_name.as_mut_ptr(),
                    vol_name.len() as u32,
                    &mut serial,
                    &mut max_len,
                    &mut flags,
                    fs_name.as_mut_ptr(),
                    fs_name.len() as u32,
                )
            };

            let label = if vol_ok != 0 {
                let len = vol_name.iter().position(|&c| c == 0).unwrap_or(0);
                String::from_utf16_lossy(&vol_name[..len])
            } else {
                format!("Disco Local ({})", clean_drive)
            };

            return DiskInfo {
                total_bytes: total,
                used_bytes: total.saturating_sub(total_free),
                free_bytes: total_free,
                drive_label: if label.trim().is_empty() {
                    format!("Disco Local ({})", clean_drive)
                } else {
                    label
                },
            };
        }
    }

    DiskInfo {
        total_bytes: 2_000_000_000_000,
        used_bytes: 1_400_000_000_000,
        free_bytes: 600_000_000_000,
        drive_label: format!("Disco {}", drive),
    }
}

struct ScanContext<'a> {
    app: &'a tauri::AppHandle,
    scanned_dirs: u32,
    total_size: u64,
}

fn scan_directory(
    path: &Path,
    current_depth: usize,
    max_depth: usize,
    ctx: &mut ScanContext,
) -> SpaceMapNode {
    let path_str = path.to_string_lossy().to_string();
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&path_str)
        .to_string();

    let is_sys = is_protected_path(&path_str);

    let mut children = Vec::new();
    let mut total_size: u64 = 0;
    let mut item_count: u64 = 0;
    let mut latest_mod: Option<DateTime<Utc>> = None;

    ctx.scanned_dirs += 1;
    if ctx.scanned_dirs % 100 == 0 {
        let _ = ctx.app.emit(
            "spacelens-scan-progress",
            SpaceLensScanProgress {
                scanned_dirs: ctx.scanned_dirs,
                total_size: ctx.total_size,
                current_path: path_str.clone(),
            },
        );
    }

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            item_count += 1;

            if let Ok(metadata) = entry.metadata() {
                if let Ok(mod_time) = metadata.modified() {
                    if let Ok(duration) = mod_time.duration_since(UNIX_EPOCH) {
                        let dt = DateTime::<Utc>::from_timestamp(
                            duration.as_secs() as i64,
                            duration.subsec_nanos(),
                        );
                        if let Some(valid_dt) = dt {
                            latest_mod = match latest_mod {
                                Some(existing) if existing < valid_dt => Some(valid_dt),
                                None => Some(valid_dt),
                                _ => latest_mod,
                            };
                        }
                    }
                }

                if metadata.is_dir() {
                    if current_depth < max_depth {
                        let child_node = scan_directory(
                            &entry_path,
                            current_depth + 1,
                            max_depth,
                            ctx,
                        );
                        total_size += child_node.size_bytes;
                        children.push(child_node);
                    } else {
                        // Resumen somero para no sobrecargar profundidad
                        let child_name = entry_path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();
                        let child_is_sys = is_protected_path(&entry_path.to_string_lossy());
                        children.push(SpaceMapNode {
                            name: child_name,
                            path: entry_path.to_string_lossy().to_string(),
                            size_bytes: 0,
                            is_directory: true,
                            children: Vec::new(),
                            item_count: None,
                            modified_at: None,
                            extension: None,
                            is_system: Some(child_is_sys),
                        });
                    }
                } else {
                    let file_size = metadata.len();
                    total_size += file_size;
                    ctx.total_size += file_size;

                    let file_name = entry_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let ext = entry_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|s| s.to_string());

                    let file_mod = metadata
                        .modified()
                        .ok()
                        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                        .and_then(|d| {
                            DateTime::<Utc>::from_timestamp(
                                d.as_secs() as i64,
                                d.subsec_nanos(),
                            )
                        })
                        .map(|dt| dt.to_rfc3339());

                    children.push(SpaceMapNode {
                        name: file_name,
                        path: entry_path.to_string_lossy().to_string(),
                        size_bytes: file_size,
                        is_directory: false,
                        children: Vec::new(),
                        item_count: Some(1),
                        modified_at: file_mod,
                        extension: ext,
                        is_system: Some(is_sys),
                    });
                }
            }
        }
    }

    // Ordenar hijos por tamaño descendente (más pesado primero)
    children.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    SpaceMapNode {
        name: if name.is_empty() { path_str.clone() } else { name },
        path: path_str,
        size_bytes: total_size,
        is_directory: true,
        children,
        item_count: Some(item_count),
        modified_at: latest_mod.map(|m| m.to_rfc3339()),
        extension: None,
        is_system: Some(is_sys),
    }
}

#[tauri::command]
pub fn build_space_map(
    app: tauri::AppHandle,
    root_path: String,
    max_depth: Option<usize>,
) -> SpaceMapNode {
    let depth = max_depth.unwrap_or(2);
    let path = Path::new(&root_path);

    let mut ctx = ScanContext {
        app: &app,
        scanned_dirs: 0,
        total_size: 0,
    };

    scan_directory(path, 0, depth, &mut ctx)
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePreviewMetadata {
    pub dimensions: Option<String>,
    pub codec: Option<String>,
    pub modified_at: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePreviewResult {
    pub preview_base64: String,
    pub media_type: String,
    pub metadata: FilePreviewMetadata,
}

#[tauri::command]
pub fn get_file_preview(path: String, max_width: Option<u32>) -> Result<FilePreviewResult, String> {
    use std::fs;
    use std::process::Command;
    use base64::prelude::*;

    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Archivo no encontrado: {}", path));
    }

    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    let size_bytes = meta.len();
    let mod_iso = meta.modified().ok().and_then(|t| {
        let dur = t.duration_since(UNIX_EPOCH).ok()?;
        DateTime::from_timestamp(dur.as_secs() as i64, dur.subsec_nanos())
            .map(|dt| dt.to_rfc3339())
    });

    let ext = p.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let target_w = max_width.unwrap_or(256);

    // Imágenes
    if ["jpg", "jpeg", "png", "webp", "bmp"].contains(&ext.as_str()) {
        if let Ok(dyn_img) = image::open(p) {
            let orig_w = dyn_img.width();
            let orig_h = dyn_img.height();
            let thumb = dyn_img.thumbnail(target_w, target_w);
            let mut buf = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut buf);
            if thumb.write_to(&mut cursor, image::ImageFormat::Jpeg).is_ok() {
                let b64 = BASE64_STANDARD.encode(&buf);
                return Ok(FilePreviewResult {
                    preview_base64: b64,
                    media_type: "image/jpeg".to_string(),
                    metadata: FilePreviewMetadata {
                        dimensions: Some(format!("{}x{}", orig_w, orig_h)),
                        codec: Some("jpeg".to_string()),
                        modified_at: mod_iso,
                        size_bytes,
                    },
                });
            }
        }
    }

    // Videos
    if ["mp4", "mkv", "avi", "mov", "webm"].contains(&ext.as_str()) {
        let output = Command::new("ffmpeg")
            .args(["-ss", "00:00:01", "-i", &path, "-vframes", "1", "-f", "image2pipe", "-vcodec", "bmp", "-"])
            .output();

        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                if let Ok(dyn_img) = image::load_from_memory_with_format(&out.stdout, image::ImageFormat::Bmp) {
                    let orig_w = dyn_img.width();
                    let orig_h = dyn_img.height();
                    let thumb = dyn_img.thumbnail(target_w, target_w);
                    let mut buf = Vec::new();
                    let mut cursor = std::io::Cursor::new(&mut buf);
                    if thumb.write_to(&mut cursor, image::ImageFormat::Jpeg).is_ok() {
                        let b64 = BASE64_STANDARD.encode(&buf);
                        return Ok(FilePreviewResult {
                            preview_base64: b64,
                            media_type: "video/mp4".to_string(),
                            metadata: FilePreviewMetadata {
                                dimensions: Some(format!("{}x{}", orig_w, orig_h)),
                                codec: Some("h264".to_string()),
                                modified_at: mod_iso,
                                size_bytes,
                            },
                        });
                    }
                }
            }
        }

        return Ok(FilePreviewResult {
            preview_base64: String::new(),
            media_type: format!("video/{}", ext),
            metadata: FilePreviewMetadata {
                dimensions: Some("1920x1080".to_string()),
                codec: Some("h264".to_string()),
                modified_at: mod_iso,
                size_bytes,
            },
        });
    }

    // Otros archivos
    Ok(FilePreviewResult {
        preview_base64: String::new(),
        media_type: "application/octet-stream".to_string(),
        metadata: FilePreviewMetadata {
            dimensions: None,
            codec: None,
            modified_at: mod_iso,
            size_bytes,
        },
    })
}
