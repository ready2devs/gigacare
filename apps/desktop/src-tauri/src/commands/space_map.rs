use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceMapNode {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    pub children: Vec<SpaceMapNode>,
}

#[tauri::command]
pub fn build_space_map(root_path: String, max_depth: Option<usize>) -> SpaceMapNode {
    let _depth = max_depth.unwrap_or(3);
    SpaceMapNode {
        name: root_path.clone(),
        path: root_path,
        size_bytes: 1024 * 1024 * 50,
        is_directory: true,
        children: Vec::new(),
    }
}
