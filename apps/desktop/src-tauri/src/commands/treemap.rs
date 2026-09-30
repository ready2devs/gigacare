use gigacare_treemap::models::{LayoutNode, Point, Rect, SunburstArc, TreemapRect};
use gigacare_treemap::squarified::squarified_layout;
use gigacare_treemap::sunburst::sunburst_layout;

#[tauri::command]
pub async fn compute_treemap_layout(
    nodes: Vec<LayoutNode>,
    container: Rect,
) -> Result<Vec<TreemapRect>, String> {
    Ok(squarified_layout(&nodes, container))
}

#[tauri::command]
pub async fn compute_sunburst_layout(
    root: LayoutNode,
    center: Point,
    inner_radius: f64,
    ring_width: f64,
    max_depth: usize,
) -> Result<Vec<SunburstArc>, String> {
    Ok(sunburst_layout(&root, center, inner_radius, ring_width, max_depth))
}
