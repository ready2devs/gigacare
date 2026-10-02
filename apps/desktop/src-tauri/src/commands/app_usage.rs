use std::collections::HashMap;
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppUsageInfo {
    pub app_id: String,
    pub last_used_at: Option<String>,
    pub usage_count: Option<u32>,
    pub last_used_days: Option<u32>,
    pub source: String, // "prefetch" | "userassist" | "file_modified" | "unknown"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefetchEntry {
    pub exe_name: String,
    pub last_used_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAssistEntry {
    pub name: String,
    pub run_count: u32,
    pub last_run_time: Option<String>,
}

pub fn rot13(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='m' | 'A'..='M' => ((c as u8) + 13) as char,
            'n'..='z' | 'N'..='Z' => ((c as u8) - 13) as char,
            _ => c,
        })
        .collect()
}

pub fn filetime_to_iso8601(filetime: u64) -> Option<String> {
    const EPOCH_DIFFERENCE: u64 = 116_444_736_000_000_000;
    if filetime <= EPOCH_DIFFERENCE {
        return None;
    }
    let unix_100ns = filetime - EPOCH_DIFFERENCE;
    let unix_secs = (unix_100ns / 10_000_000) as i64;
    let nanos = ((unix_100ns % 10_000_000) * 100) as u32;

    DateTime::from_timestamp(unix_secs, nanos).map(|dt| dt.to_rfc3339())
}

pub fn extract_prefetch_exe_name(pf_filename: &str) -> String {
    let base = pf_filename.trim_end_matches(".pf").trim_end_matches(".PF");
    if let Some(idx) = base.find('-') {
        base[..idx].to_string()
    } else {
        base.to_string()
    }
}

pub fn scan_prefetch() -> HashMap<String, PrefetchEntry> {
    let mut map = HashMap::new();

    let prefetch_dir = std::env::var("SystemRoot")
        .map(|r| PathBuf::from(r).join("Prefetch"))
        .unwrap_or_else(|_| PathBuf::from(r"C:WindowsPrefetch"));

    if !prefetch_dir.exists() {
        return map;
    }

    if let Ok(entries) = std::fs::read_dir(prefetch_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.to_lowercase().ends_with(".pf") {
                let exe_name = extract_prefetch_exe_name(name);
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                let lower_key = exe_name.to_lowercase();
                map.insert(
                    lower_key,
                    PrefetchEntry {
                        exe_name,
                        last_used_at: modified,
                    },
                );
            }
        }
    }

    map
}

pub fn scan_userassist() -> HashMap<String, UserAssistEntry> {
    let mut map = HashMap::new();

    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
        use winreg::RegKey;

        let guids = [
            "{CEBFF5CD-ACE2-4F4F-9178-9926F41749EA}",
            "{F4E57C4B-2036-45F0-A9AB-443BCFE33D9F}",
        ];

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for guid in &guids {
            let path = format!(
                r"SoftwareMicrosoftWindowsCurrentVersionExplorerUserAssist{}Count",
                guid
            );
            if let Ok(count_key) = hkcu.open_subkey_with_flags(&path, KEY_READ) {
                for val in count_key.enum_values().flatten() {
                    let (encoded_name, reg_val) = val;
                    let decoded_name = rot13(&encoded_name);

                    let bytes = reg_val.bytes;
                    let mut run_count: u32 = 0;
                    let mut last_run_time: Option<String> = None;

                    if bytes.len() >= 68 {
                        if let Ok(slice) = bytes[4..8].try_into() {
                            run_count = u32::from_le_bytes(slice);
                        }
                        if let Ok(slice) = bytes[60..68].try_into() {
                            let ft = u64::from_le_bytes(slice);
                            last_run_time = filetime_to_iso8601(ft);
                        }
                    } else if bytes.len() >= 16 {
                        if let Ok(slice) = bytes[4..8].try_into() {
                            run_count = u32::from_le_bytes(slice);
                        }
                    }

                    let clean_name = decoded_name
                        .rsplit('\\')
                        .next()
                        .unwrap_or(&decoded_name)
                        .to_string();

                    map.insert(
                        clean_name.to_lowercase(),
                        UserAssistEntry {
                            name: clean_name,
                            run_count,
                            last_run_time,
                        },
                    );
                }
            }
        }
    }

    map
}

pub fn merge_usage(
    prefetch: &HashMap<String, PrefetchEntry>,
    userassist: &HashMap<String, UserAssistEntry>,
    app_id_or_name: &str,
) -> AppUsageInfo {
    let lower_name = app_id_or_name.to_lowercase();
    let lower_no_ext = lower_name.trim_end_matches(".exe");

    // Match in prefetch
    let pf_match = prefetch
        .get(&lower_name)
        .or_else(|| prefetch.get(lower_no_ext))
        .or_else(|| {
            prefetch
                .iter()
                .find(|(k, _)| k.contains(lower_no_ext) || lower_no_ext.contains(k.as_str()))
                .map(|(_, v)| v)
        });

    // Match in userassist
    let ua_match = userassist
        .get(&lower_name)
        .or_else(|| userassist.get(lower_no_ext))
        .or_else(|| {
            userassist
                .iter()
                .find(|(k, _)| k.contains(lower_no_ext) || lower_no_ext.contains(k.as_str()))
                .map(|(_, v)| v)
        });

    let now = Utc::now();

    let pf_dt = pf_match.and_then(|p| DateTime::parse_from_rfc3339(&p.last_used_at).ok().map(|d| d.with_timezone(&Utc)));
    let ua_dt = ua_match.and_then(|u| u.last_run_time.as_ref())
        .and_then(|t| DateTime::parse_from_rfc3339(t).ok().map(|d| d.with_timezone(&Utc)));

    let mut last_used_at: Option<String> = None;
    let mut source = "unknown".to_string();
    let mut usage_count: Option<u32> = ua_match.map(|u| u.run_count);

    match (pf_dt, ua_dt) {
        (Some(p_time), Some(u_time)) => {
            if u_time >= p_time {
                last_used_at = Some(u_time.to_rfc3339());
                source = "userassist".to_string();
            } else {
                last_used_at = Some(p_time.to_rfc3339());
                source = "prefetch".to_string();
            }
        }
        (Some(p_time), None) => {
            last_used_at = Some(p_time.to_rfc3339());
            source = "prefetch".to_string();
        }
        (None, Some(u_time)) => {
            last_used_at = Some(u_time.to_rfc3339());
            source = "userassist".to_string();
        }
        (None, None) => {}
    }

    let last_used_days = last_used_at.as_ref().and_then(|iso| {
        DateTime::parse_from_rfc3339(iso).ok().map(|dt| {
            let duration = now.signed_duration_since(dt.with_timezone(&Utc));
            duration.num_days().max(0) as u32
        })
    });

    if usage_count == Some(0) && source == "unknown" {
        usage_count = None;
    }

    AppUsageInfo {
        app_id: app_id_or_name.to_string(),
        last_used_at,
        usage_count,
        last_used_days,
        source,
    }
}

#[tauri::command]
pub fn get_app_usage(app_ids: Vec<String>) -> Vec<AppUsageInfo> {
    let prefetch = scan_prefetch();
    let userassist = scan_userassist();

    app_ids
        .into_iter()
        .map(|id| merge_usage(&prefetch, &userassist, &id))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rot13_decoding() {
        assert_eq!(rot13("PNYPXRL.rkr"), "CALCKEY.exe");
        assert_eq!(rot13("AbcDef123!"), "NopQrs123!");
        assert_eq!(rot13(""), "");
    }

    #[test]
    fn test_prefetch_parsing_extracts_correct_name() {
        assert_eq!(extract_prefetch_exe_name("CHROME.EXE-A1B2C3D4.pf"), "CHROME.EXE");
        assert_eq!(extract_prefetch_exe_name("calc.exe-1234.pf"), "calc.exe");
        assert_eq!(extract_prefetch_exe_name("notepad.exe.pf"), "notepad.exe");
        assert_eq!(extract_prefetch_exe_name("app-with-dashes-123456.PF"), "app");
    }

    #[test]
    fn test_merge_prioritizes_most_recent_source() {
        let mut prefetch = HashMap::new();
        prefetch.insert(
            "testapp.exe".to_string(),
            PrefetchEntry {
                exe_name: "testapp.exe".to_string(),
                last_used_at: "2026-10-01T12:00:00Z".to_string(),
            },
        );

        let mut userassist = HashMap::new();
        userassist.insert(
            "testapp.exe".to_string(),
            UserAssistEntry {
                name: "testapp.exe".to_string(),
                run_count: 42,
                last_run_time: Some("2026-10-04T12:00:00Z".to_string()),
            },
        );

        let info = merge_usage(&prefetch, &userassist, "testapp.exe");
        assert_eq!(info.source, "userassist");
        assert_eq!(info.usage_count, Some(42));
        assert!(info.last_used_at.unwrap().contains("2026-10-04"));

        // Now reverse dates: prefetch is more recent
        let mut prefetch2 = HashMap::new();
        prefetch2.insert(
            "testapp.exe".to_string(),
            PrefetchEntry {
                exe_name: "testapp.exe".to_string(),
                last_used_at: "2026-10-05T12:00:00Z".to_string(),
            },
        );
        let info2 = merge_usage(&prefetch2, &userassist, "testapp.exe");
        assert_eq!(info2.source, "prefetch");
        assert!(info2.last_used_at.unwrap().contains("2026-10-05"));
        assert_eq!(info2.usage_count, Some(42));
    }

    #[test]
    fn test_app_without_match_has_unknown_source_and_null_fields() {
        let prefetch = HashMap::new();
        let userassist = HashMap::new();

        let info = merge_usage(&prefetch, &userassist, "NonExistentApp12345");
        assert_eq!(info.source, "unknown");
        assert_eq!(info.last_used_at, None);
        assert_eq!(info.usage_count, None);
        assert_eq!(info.last_used_days, None);
    }

    #[test]
    fn test_filetime_to_iso8601_conversion() {
        // Windows FILETIME 134346028411800000 corresponds to Sep 2026
        let res = filetime_to_iso8601(134346028411800000);
        assert!(res.is_some());
        let iso = res.unwrap();
        assert!(iso.starts_with("2026"));

        // Very old or zero filetime returns None
        assert_eq!(filetime_to_iso8601(0), None);
    }
}
