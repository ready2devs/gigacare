use gigacare_ai::gemini_client::GeminiClient;
use gigacare_ai::models::{FileFilterQuery, FileFilterResult, FileNode, FilterCondition, TreeSummaryNode};
use gigacare_ai::nl_query::execute_file_filter;


#[tauri::command]
pub async fn nl_query_files(
    query: String,
    tree_summary: Option<Vec<TreeSummaryNode>>,
    nodes: Option<Vec<FileNode>>,
) -> Result<FileFilterResult, String> {
    let summary = tree_summary.unwrap_or_default();

    // Intentar consultar con Gemini si la API key está presente
    let client = GeminiClient::new();
    let query_parsed = match client.send_nl_query(&query, &summary).await {
        Ok(parsed) => parsed,
        Err(_err) => {
            // Fallback heurístico local si no hay API key o falló la conexión
            let q_lower = query.to_lowercase();
            let mut conditions = Vec::new();

            if q_lower.contains("video") || q_lower.contains("película") || q_lower.contains("pelicula") {
                conditions.push(FilterCondition {
                    field: "category".to_string(),
                    operator: "eq".to_string(),
                    value: serde_json::json!("video"),
                });
            } else if q_lower.contains("foto") || q_lower.contains("imagen") || q_lower.contains("picture") {
                conditions.push(FilterCondition {
                    field: "category".to_string(),
                    operator: "eq".to_string(),
                    value: serde_json::json!("image"),
                });
            }

            if q_lower.contains("1gb") || q_lower.contains("1 gb") {
                conditions.push(FilterCondition {
                    field: "size_bytes".to_string(),
                    operator: "gt".to_string(),
                    value: serde_json::json!(1073741824u64),
                });
            } else if q_lower.contains("100mb") || q_lower.contains("100 mb") {
                conditions.push(FilterCondition {
                    field: "size_bytes".to_string(),
                    operator: "gt".to_string(),
                    value: serde_json::json!(104857600u64),
                });
            }

            if conditions.is_empty() {
                conditions.push(FilterCondition {
                    field: "size_bytes".to_string(),
                    operator: "gt".to_string(),
                    value: serde_json::json!(104857600u64),
                });
            }

            FileFilterQuery {
                conditions,
                logical_operator: "AND".to_string(),
            }
        }
    };

    let target_nodes = nodes.unwrap_or_default();
    Ok(execute_file_filter(&target_nodes, &query_parsed))
}

#[tauri::command]
pub async fn suggest_auto_rules(
    nodes: Option<Vec<FileNode>>,
) -> Result<Vec<gigacare_ai::models::AutoQuarantineRule>, String> {
    let target_nodes = nodes.unwrap_or_default();
    Ok(gigacare_ai::nl_query::suggest_auto_rules(&target_nodes))
}
