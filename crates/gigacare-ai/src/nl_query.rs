use std::time::{SystemTime, UNIX_EPOCH};
use crate::models::{FileFilterQuery, FileFilterResult, FileNode, FilterCondition};

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    const K: f64 = 1024.0;
    let b = bytes as f64;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (b.ln() / K.ln()).floor() as usize;
    let i = i.min(sizes.len() - 1);
    let val = b / K.powi(i as i32);
    format!("{:.1} {}", val, sizes[i])
}

fn determine_category(ext: Option<&str>) -> &'static str {
    match ext.map(|s| s.to_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") | Some("png") | Some("webp") | Some("bmp") | Some("heic") | Some("gif") => "image",
        Some("mp4") | Some("mkv") | Some("avi") | Some("mov") | Some("wmv") | Some("webm") => "video",
        Some("mp3") | Some("wav") | Some("flac") | Some("aac") | Some("ogg") | Some("m4a") => "audio",
        Some("pdf") | Some("doc") | Some("docx") | Some("txt") | Some("xls") | Some("xlsx") | Some("ppt") => "document",
        Some("exe") | Some("msi") | Some("iso") | Some("dmg") => "installer",
        Some("tmp") | Some("temp") | Some("bak") => "temp",
        _ => "other",
    }
}

fn evaluate_condition(node: &FileNode, cond: &FilterCondition) -> bool {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    match cond.field.as_str() {
        "size_bytes" => {
            let target = match cond.value.as_u64().or_else(|| cond.value.as_f64().map(|f| f as u64)) {
                Some(v) => v,
                None => return false,
            };
            match cond.operator.as_str() {
                "eq" => node.size_bytes == target,
                "gt" => node.size_bytes > target,
                "lt" => node.size_bytes < target,
                "gte" => node.size_bytes >= target,
                "lte" => node.size_bytes <= target,
                _ => false,
            }
        }
        "extension" => {
            let ext = node.extension.as_deref().unwrap_or("").trim_start_matches('.').to_lowercase();
            match cond.operator.as_str() {
                "eq" => {
                    let val = cond.value.as_str().unwrap_or("").trim_start_matches('.').to_lowercase();
                    ext == val
                }
                "in" => {
                    if let Some(arr) = cond.value.as_array() {
                        arr.iter().any(|v| {
                            v.as_str().map(|s| s.trim_start_matches('.').to_lowercase() == ext).unwrap_or(false)
                        })
                    } else {
                        false
                    }
                }
                "not_in" => {
                    if let Some(arr) = cond.value.as_array() {
                        !arr.iter().any(|v| {
                            v.as_str().map(|s| s.trim_start_matches('.').to_lowercase() == ext).unwrap_or(false)
                        })
                    } else {
                        true
                    }
                }
                _ => false,
            }
        }
        "category" => {
            let node_cat = determine_category(node.extension.as_deref());
            let target_cat = cond.value.as_str().unwrap_or("").to_lowercase();
            match cond.operator.as_str() {
                "eq" => node_cat == target_cat,
                "in" => {
                    if let Some(arr) = cond.value.as_array() {
                        arr.iter().any(|v| v.as_str().map(|s| s.to_lowercase() == node_cat).unwrap_or(false))
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        "name" => {
            let name_lower = node.name.to_lowercase();
            let target = cond.value.as_str().unwrap_or("").to_lowercase();
            match cond.operator.as_str() {
                "eq" => name_lower == target,
                "contains" => name_lower.contains(&target),
                _ => false,
            }
        }
        "path" => {
            let path_lower = node.path.to_lowercase();
            let target = cond.value.as_str().unwrap_or("").to_lowercase();
            match cond.operator.as_str() {
                "contains" => path_lower.contains(&target),
                "eq" => path_lower == target,
                _ => false,
            }
        }
        "modified_at" | "older_than_days" => {
            if cond.operator == "older_than_days" {
                let days = cond.value.as_u64().unwrap_or(0);
                let threshold_secs = days * 86400;
                let age = now_secs.saturating_sub(node.modified_at);
                age >= threshold_secs
            } else {
                let target = cond.value.as_u64().unwrap_or(0);
                match cond.operator.as_str() {
                    "gt" => node.modified_at > target,
                    "lt" => node.modified_at < target,
                    "gte" => node.modified_at >= target,
                    "lte" => node.modified_at <= target,
                    "eq" => node.modified_at == target,
                    _ => false,
                }
            }
        }
        _ => false,
    }
}

pub fn matches_query(node: &FileNode, query: &FileFilterQuery) -> bool {
    if query.conditions.is_empty() {
        return false;
    }

    let is_or = query.logical_operator.eq_ignore_ascii_case("OR");

    if is_or {
        query.conditions.iter().any(|c| evaluate_condition(node, c))
    } else {
        query.conditions.iter().all(|c| evaluate_condition(node, c))
    }
}

pub fn execute_file_filter(nodes: &[FileNode], query: &FileFilterQuery) -> FileFilterResult {
    let mut matched_paths = Vec::new();
    let mut total_bytes = 0u64;

    for node in nodes {
        if !node.is_directory && matches_query(node, query) {
            matched_paths.push(node.path.clone());
            total_bytes += node.size_bytes;
        }
    }

    let total_matched = matched_paths.len();
    let summary = format!(
        "Se identificaron {} archivos ({} recuperables)",
        total_matched,
        format_bytes(total_bytes)
    );

    FileFilterResult {
        query_parsed: query.clone(),
        matched_paths,
        total_matched,
        total_bytes,
        summary,
    }
}


use crate::models::AutoQuarantineRule;

pub fn suggest_auto_rules(nodes: &[FileNode]) -> Vec<AutoQuarantineRule> {
    let mut rules = Vec::new();

    // Regla 1: Capturas de pantalla > 90 días
    let screenshots_query = FileFilterQuery {
        conditions: vec![
            FilterCondition {
                field: "category".to_string(),
                operator: "eq".to_string(),
                value: serde_json::json!("image"),
            },
            FilterCondition {
                field: "name".to_string(),
                operator: "contains".to_string(),
                value: serde_json::json!("screenshot"),
            },
            FilterCondition {
                field: "modified_at".to_string(),
                operator: "older_than_days".to_string(),
                value: serde_json::json!(90),
            },
        ],
        logical_operator: "AND".to_string(),
    };

    let ss_res = execute_file_filter(nodes, &screenshots_query);
    if ss_res.total_matched > 0 {
        rules.push(AutoQuarantineRule {
            id: "rule-screenshots-90d".to_string(),
            description: "Capturas de pantalla con más de 90 días de antigüedad".to_string(),
            condition: screenshots_query,
            matched_count: ss_res.total_matched,
            matched_bytes: ss_res.total_bytes,
            user_approved: false,
        });
    }

    // Regla 2: Archivos temporales huérfanos (.tmp, .bak, .old)
    let temp_query = FileFilterQuery {
        conditions: vec![FilterCondition {
            field: "extension".to_string(),
            operator: "in".to_string(),
            value: serde_json::json!(["tmp", "bak", "old", "log"]),
        }],
        logical_operator: "AND".to_string(),
    };

    let temp_res = execute_file_filter(nodes, &temp_query);
    if temp_res.total_matched > 0 {
        rules.push(AutoQuarantineRule {
            id: "rule-temp-orphans".to_string(),
            description: "Archivos temporales o respaldos huérfanos (.tmp, .bak, .old, .log)".to_string(),
            condition: temp_query,
            matched_count: temp_res.total_matched,
            matched_bytes: temp_res.total_bytes,
            user_approved: false,
        });
    }

    rules
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_task27_execute_file_filter_size_gt_1gb() {
        // 10 archivos: 3 de >1GB y 7 de menor tamaño
        let gb = 1024 * 1024 * 1024u64;
        let mut nodes = Vec::new();

        nodes.push(FileNode { path: "/v1.mp4".into(), name: "v1.mp4".into(), size_bytes: 2 * gb, is_directory: false, modified_at: 0, extension: Some("mp4".into()), is_system: false, children: vec![], item_count: 0 });
        nodes.push(FileNode { path: "/v2.mkv".into(), name: "v2.mkv".into(), size_bytes: 3 * gb, is_directory: false, modified_at: 0, extension: Some("mkv".into()), is_system: false, children: vec![], item_count: 0 });
        nodes.push(FileNode { path: "/v3.iso".into(), name: "v3.iso".into(), size_bytes: 5 * gb, is_directory: false, modified_at: 0, extension: Some("iso".into()), is_system: false, children: vec![], item_count: 0 });

        for i in 4..=10 {
            nodes.push(FileNode {
                path: format!("/file_{}.dat", i),
                name: format!("file_{}.dat", i),
                size_bytes: 100 * 1024 * 1024, // 100MB
                is_directory: false,
                modified_at: 0,
                extension: Some("dat".into()),
                is_system: false,
                children: vec![],
                item_count: 0,
            });
        }

        assert_eq!(nodes.len(), 10);

        let query = FileFilterQuery {
            conditions: vec![FilterCondition {
                field: "size_bytes".into(),
                operator: "gt".into(),
                value: json!(1 * gb),
            }],
            logical_operator: "AND".into(),
        };

        let result = execute_file_filter(&nodes, &query);
        println!("Resultado: {:?}", result);

        assert_eq!(result.total_matched, 3, "Debe retornar exactamente 3 matches");
        assert_eq!(result.matched_paths.len(), 3);
        assert_eq!(result.total_bytes, (2 + 3 + 5) * gb);
        assert!(result.summary.contains("Se identificaron 3 archivos"));
    }

    #[test]
    fn test_task35_suggest_auto_rules_10_screenshots_100_days() {
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let hundred_days_ago = now_secs.saturating_sub(100 * 86400);

        let mut nodes = Vec::new();
        for i in 1..=10 {
            nodes.push(FileNode {
                path: format!("C:\\Users\\Demo\\Pictures\\Screenshot_{}.png", i),
                name: format!("Screenshot_{}.png", i),
                size_bytes: 2 * 1024 * 1024,
                is_directory: false,
                modified_at: hundred_days_ago,
                extension: Some("png".to_string()),
                is_system: false,
                children: vec![],
                item_count: 0,
            });
        }

        // Agregar archivo reciente para asegurar que no haga match
        nodes.push(FileNode {
            path: "C:\\Users\\Demo\\Pictures\\Screenshot_recent.png".to_string(),
            name: "Screenshot_recent.png".to_string(),
            size_bytes: 2 * 1024 * 1024,
            is_directory: false,
            modified_at: now_secs,
            extension: Some("png".to_string()),
            is_system: false,
            children: vec![],
            item_count: 0,
        });

        let rules = suggest_auto_rules(&nodes);
        assert!(!rules.is_empty(), "Debe sugerir al menos una regla");
        let ss_rule = rules.iter().find(|r| r.id == "rule-screenshots-90d").expect("Debe incluir la regla de screenshots");
        assert_eq!(ss_rule.matched_count, 10, "Debe hacer match exactamente con los 10 screenshots de 100+ días");
        assert_eq!(ss_rule.matched_bytes, 10 * 2 * 1024 * 1024);
    }
}
