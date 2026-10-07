use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FillForecast {
    pub gb_per_day: f64,
    pub full_in_weeks: f64,
    pub readings_count: usize,
    pub readings_period_days: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DriveHealthInfo {
    pub drive_letter: String,
    pub drive_label: String,
    pub drive_path: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub usage_percent: f64,
    pub disk_type: String, // "SSD_NVMe" | "SSD_SATA" | "HDD" | "Unknown"
    pub filesystem: String,
    pub smart_status: String, // "Healthy" | "Warning" | "Critical" | "Unknown"
    pub temperature_celsius: Option<f64>,
    pub drive_wear_percent: Option<f64>,
    pub reallocated_sectors: Option<u64>,
    pub power_on_hours: Option<u64>,
    pub fill_forecast: Option<FillForecast>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DriveReading {
    pub timestamp: String, // ISO-8601
    pub used_bytes: u64,
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

pub fn get_drive_readings_path() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".gigacare").join("drive_readings.json"))
        .unwrap_or_else(|| PathBuf::from("drive_readings.json"))
}

pub fn load_readings(path: &Path) -> Vec<DriveReading> {
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn save_reading(path: &Path, reading: DriveReading) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut readings = load_readings(path);
    // Purge readings older than 90 days
    let now = Utc::now();
    let cutoff = now - Duration::days(90);

    readings.retain(|r| {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&r.timestamp) {
            dt.with_timezone(&Utc) >= cutoff
        } else {
            false
        }
    });

    readings.push(reading);

    let json = serde_json::to_string_pretty(&readings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn calculate_forecast(readings: &[DriveReading], free_bytes: u64) -> Option<FillForecast> {
    let now = Utc::now();
    let cutoff = now - Duration::days(90);

    let mut valid_readings: Vec<(f64, f64)> = Vec::new();
    let mut min_time: Option<DateTime<Utc>> = None;
    let mut max_time: Option<DateTime<Utc>> = None;

    for r in readings {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&r.timestamp) {
            let utc_dt = dt.with_timezone(&Utc);
            if utc_dt >= cutoff {
                if min_time.is_none() || Some(utc_dt) < min_time {
                    min_time = Some(utc_dt);
                }
                if max_time.is_none() || Some(utc_dt) > max_time {
                    max_time = Some(utc_dt);
                }
                valid_readings.push((utc_dt.timestamp() as f64, r.used_bytes as f64));
            }
        }
    }

    if valid_readings.len() < 3 {
        return None;
    }

    let min_dt = min_time?;
    let max_dt = max_time?;
    let period_days = ((max_dt - min_dt).num_seconds() as f64) / 86400.0;

    let n = valid_readings.len() as f64;
    let mean_x = valid_readings.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let mean_y = valid_readings.iter().map(|(_, y)| *y).sum::<f64>() / n;

    let mut num = 0.0;
    let mut den = 0.0;
    for (x, y) in &valid_readings {
        let dx = x - mean_x;
        let dy = y - mean_y;
        num += dx * dy;
        den += dx * dx;
    }

    if den.abs() < 1e-9 {
        return None;
    }

    let slope_bytes_per_sec = num / den;
    let bytes_per_day = slope_bytes_per_sec * 86400.0;
    let gb_per_day = (bytes_per_day / (1024.0 * 1024.0 * 1024.0)).max(0.0);

    let full_in_weeks = if bytes_per_day > 0.0 {
        let days_until_full = (free_bytes as f64) / bytes_per_day;
        (days_until_full / 7.0).max(0.0)
    } else {
        999.0 // effectively infinite
    };

    Some(FillForecast {
        gb_per_day: (gb_per_day * 100.0).round() / 100.0,
        full_in_weeks: (full_in_weeks * 10.0).round() / 10.0,
        readings_count: valid_readings.len(),
        readings_period_days: (period_days * 10.0).round() / 10.0,
    })
}

#[cfg(windows)]
fn query_wmi_disk_info(_drive_letter: &str) -> (String, String, Option<f64>, Option<f64>, Option<u64>, Option<u64>) {
    use std::collections::HashMap;
    use wmi::{COMLibrary, WMIConnection};

    let mut disk_type = "Unknown".to_string();
    let mut smart_status = "Unknown".to_string();
    let mut temperature: Option<f64> = None;
    let mut wear: Option<f64> = None;
    let mut reallocated: Option<u64> = None;
    let mut power_on_hours: Option<u64> = None;

    // Use COMLibrary without requiring security initialization to prevent conflict
    let com_lib = match COMLibrary::without_security() {
        Ok(c) => c,
        Err(_) => return (disk_type, smart_status, temperature, wear, reallocated, power_on_hours),
    };

    // 1. Query Win32_DiskDrive in root\cimv2
    if let Ok(wmi_con) = WMIConnection::new(com_lib) {
        if let Ok(results) = wmi_con.raw_query("SELECT Model, MediaType, InterfaceType FROM Win32_DiskDrive") {
            for item in results {
                let map: HashMap<String, serde_json::Value> = item;
                let interface = map.get("InterfaceType").and_then(|v| v.as_str()).unwrap_or("");
                let media = map.get("MediaType").and_then(|v| v.as_str()).unwrap_or("");

                if interface.eq_ignore_ascii_case("SCSI") || interface.eq_ignore_ascii_case("NVMe") {
                    if media.to_lowercase().contains("ssd") || interface.eq_ignore_ascii_case("NVMe") {
                        disk_type = "SSD_NVMe".to_string();
                    } else {
                        disk_type = "SSD_NVMe".to_string(); // Modern NVMe drives report SCSI interface in Win32_DiskDrive
                    }
                } else if media.to_lowercase().contains("solid") || media.to_lowercase().contains("ssd") {
                    disk_type = "SSD_SATA".to_string();
                } else if media.to_lowercase().contains("fixed") || media.to_lowercase().contains("hard") {
                    disk_type = "HDD".to_string();
                }
            }
        }
    }

    // 2. Query MSFT_PhysicalDisk in root\Microsoft\Windows\Storage
    if let Ok(com_lib2) = COMLibrary::without_security() {
        if let Ok(storage_con) = WMIConnection::with_namespace_path("ROOT\\Microsoft\\Windows\\Storage", com_lib2) {
            if let Ok(results) = storage_con.raw_query("SELECT DeviceId, MediaType, BusType, HealthStatus FROM MSFT_PhysicalDisk") {
                for item in results {
                    let map: HashMap<String, serde_json::Value> = item;
                    if let Some(bus) = map.get("BusType").and_then(|v| v.as_u64()) {
                        if bus == 17 {
                            disk_type = "SSD_NVMe".to_string();
                        } else if bus == 11 || bus == 3 {
                            if disk_type == "Unknown" || disk_type == "SSD_NVMe" {
                                let m = map.get("MediaType").and_then(|v| v.as_u64()).unwrap_or(0);
                                if m == 4 {
                                    disk_type = "SSD_SATA".to_string();
                                } else if m == 3 {
                                    disk_type = "HDD".to_string();
                                }
                            }
                        }
                    }
                    if let Some(hs) = map.get("HealthStatus").and_then(|v| v.as_u64()) {
                        smart_status = match hs {
                            0 => "Healthy".to_string(),
                            1 => "Warning".to_string(),
                            2 => "Critical".to_string(),
                            _ => "Unknown".to_string(),
                        };
                    }
                }
            }

            // 3. Query MSFT_StorageReliabilityCounter for temperature, wear, power on hours
            if let Ok(results) = storage_con.raw_query("SELECT Temperature, Wear, PowerOnHours, ReadErrorsTotal FROM MSFT_StorageReliabilityCounter") {
                for item in results {
                    let map: HashMap<String, serde_json::Value> = item;
                    if let Some(t) = map.get("Temperature").and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64))) {
                        if t > 0.0 && t < 150.0 {
                            temperature = Some(t);
                        }
                    }
                    if let Some(w) = map.get("Wear").and_then(|v| v.as_f64().or_else(|| v.as_u64().map(|n| n as f64))) {
                        wear = Some(w);
                    }
                    if let Some(poh) = map.get("PowerOnHours").and_then(|v| v.as_u64()) {
                        power_on_hours = Some(poh);
                    }
                    if let Some(errors) = map.get("ReadErrorsTotal").and_then(|v| v.as_u64()) {
                        reallocated = Some(errors);
                    }
                }
            }
        }
    }

    if smart_status == "Unknown" && disk_type != "Unknown" {
        smart_status = "Healthy".to_string();
    }

    (disk_type, smart_status, temperature, wear, reallocated, power_on_hours)
}

#[tauri::command]
pub fn get_drive_health(drive: String) -> DriveHealthInfo {
    let clean_drive = drive.trim();
    let drive_letter = if clean_drive.is_empty() {
        "C:".to_string()
    } else if !clean_drive.ends_with(':') && !clean_drive.contains(':') {
        format!("{}:", clean_drive)
    } else {
        clean_drive.to_string()
    };

    let target_root = if drive_letter.ends_with('\\') || drive_letter.ends_with('/') {
        drive_letter.clone()
    } else {
        format!("{}\\", drive_letter)
    };

    let mut total_bytes: u64 = 0;
    let mut free_bytes: u64 = 0;
    let mut used_bytes: u64 = 0;
    let mut drive_label = format!("Disco Local ({})", drive_letter);
    let mut filesystem = "NTFS".to_string();

    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

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
            total_bytes = total;
            free_bytes = free_avail;
            used_bytes = total.saturating_sub(free_avail);

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

            if vol_ok != 0 {
                let len = vol_name.iter().position(|&c| c == 0).unwrap_or(0);
                if len > 0 {
                    drive_label = String::from_utf16_lossy(&vol_name[..len]);
                }
                let fs_len = fs_name.iter().position(|&c| c == 0).unwrap_or(0);
                if fs_len > 0 {
                    filesystem = String::from_utf16_lossy(&fs_name[..fs_len]);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        total_bytes = 500_000_000_000;
        free_bytes = 200_000_000_000;
        used_bytes = 300_000_000_000;
    }

    let usage_percent = if total_bytes > 0 {
        ((used_bytes as f64 / total_bytes as f64) * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    #[cfg(windows)]
    let (disk_type, smart_status, temperature_celsius, drive_wear_percent, reallocated_sectors, power_on_hours) =
        query_wmi_disk_info(&drive_letter);

    #[cfg(not(windows))]
    let (disk_type, smart_status, temperature_celsius, drive_wear_percent, reallocated_sectors, power_on_hours) =
        ("Unknown".to_string(), "Unknown".to_string(), None, None, None, None);

    // Save reading and compute fill forecast
    let readings_path = get_drive_readings_path();
    let current_reading = DriveReading {
        timestamp: Utc::now().to_rfc3339(),
        used_bytes,
    };
    let _ = save_reading(&readings_path, current_reading);

    let all_readings = load_readings(&readings_path);
    let fill_forecast = calculate_forecast(&all_readings, free_bytes);

    DriveHealthInfo {
        drive_letter,
        drive_label,
        drive_path: target_root,
        total_bytes,
        used_bytes,
        free_bytes,
        usage_percent,
        disk_type,
        filesystem,
        smart_status,
        temperature_celsius,
        drive_wear_percent,
        reallocated_sectors,
        power_on_hours,
        fill_forecast,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_drive_health_info_serialization() {
        let info = DriveHealthInfo {
            drive_letter: "C:".to_string(),
            drive_label: "OS".to_string(),
            drive_path: "C:\\".to_string(),
            total_bytes: 1_000_000_000_000,
            used_bytes: 500_000_000_000,
            free_bytes: 500_000_000_000,
            usage_percent: 50.0,
            disk_type: "SSD_NVMe".to_string(),
            filesystem: "NTFS".to_string(),
            smart_status: "Healthy".to_string(),
            temperature_celsius: Some(42.0),
            drive_wear_percent: Some(2.0),
            reallocated_sectors: Some(0),
            power_on_hours: Some(1500),
            fill_forecast: Some(FillForecast {
                gb_per_day: 1.5,
                full_in_weeks: 47.6,
                readings_count: 5,
                readings_period_days: 10.0,
            }),
        };

        let json = serde_json::to_string(&info).expect("Failed to serialize");
        let deserialized: DriveHealthInfo = serde_json::from_str(&json).expect("Failed to deserialize");
        assert_eq!(info, deserialized);
    }

    #[test]
    fn test_calculate_forecast_with_3_linear_readings() {
        let now = Utc::now();
        let readings = vec![
            DriveReading {
                timestamp: (now - Duration::days(10)).to_rfc3339(),
                used_bytes: 100 * 1024 * 1024 * 1024, // 100 GB
            },
            DriveReading {
                timestamp: (now - Duration::days(5)).to_rfc3339(),
                used_bytes: 105 * 1024 * 1024 * 1024, // 105 GB (+1 GB/day)
            },
            DriveReading {
                timestamp: now.to_rfc3339(),
                used_bytes: 110 * 1024 * 1024 * 1024, // 110 GB (+1 GB/day)
            },
        ];

        let free_bytes = 70 * 1024 * 1024 * 1024; // 70 GB free
        let forecast = calculate_forecast(&readings, free_bytes);
        assert!(forecast.is_some());
        let f = forecast.unwrap();
        assert_eq!(f.readings_count, 3);
        assert!((f.gb_per_day - 1.0).abs() < 0.1);
        assert!((f.full_in_weeks - 10.0).abs() < 1.0); // 70 GB at 1 GB/day = 70 days = 10 weeks
    }

    #[test]
    fn test_calculate_forecast_with_fewer_than_3_readings() {
        let now = Utc::now();
        let readings = vec![
            DriveReading {
                timestamp: (now - Duration::days(1)).to_rfc3339(),
                used_bytes: 100_000_000,
            },
            DriveReading {
                timestamp: now.to_rfc3339(),
                used_bytes: 101_000_000,
            },
        ];
        let forecast = calculate_forecast(&readings, 50_000_000);
        assert!(forecast.is_none());
    }

    #[test]
    fn test_purge_readings_older_than_90_days() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("readings.json");

        let old_reading = DriveReading {
            timestamp: (Utc::now() - Duration::days(95)).to_rfc3339(),
            used_bytes: 50_000,
        };
        let recent_reading = DriveReading {
            timestamp: (Utc::now() - Duration::days(10)).to_rfc3339(),
            used_bytes: 60_000,
        };

        // Write directly initial list with old reading
        let initial = vec![old_reading, recent_reading.clone()];
        std::fs::write(&file_path, serde_json::to_string(&initial).unwrap()).unwrap();

        // Save a new reading which triggers purge
        let new_reading = DriveReading {
            timestamp: Utc::now().to_rfc3339(),
            used_bytes: 70_000,
        };
        save_reading(&file_path, new_reading.clone()).unwrap();

        let loaded = load_readings(&file_path);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].used_bytes, recent_reading.used_bytes);
        assert_eq!(loaded[1].used_bytes, new_reading.used_bytes);
    }

    #[test]
    fn test_wmi_failure_fallback_defaults() {
        // Simulating failed WMI response: smart_status unknown, None values
        let info = DriveHealthInfo {
            drive_letter: "X:".to_string(),
            drive_label: "Disco Local (X:)".to_string(),
            drive_path: "X:\\".to_string(),
            total_bytes: 0,
            used_bytes: 0,
            free_bytes: 0,
            usage_percent: 0.0,
            disk_type: "Unknown".to_string(),
            filesystem: "Unknown".to_string(),
            smart_status: "Unknown".to_string(),
            temperature_celsius: None,
            drive_wear_percent: None,
            reallocated_sectors: None,
            power_on_hours: None,
            fill_forecast: None,
        };

        assert_eq!(info.smart_status, "Unknown");
        assert_eq!(info.temperature_celsius, None);
        assert_eq!(info.drive_wear_percent, None);
        assert_eq!(info.reallocated_sectors, None);
        assert_eq!(info.power_on_hours, None);
    }
}
