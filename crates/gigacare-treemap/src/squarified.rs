use crate::models::{LayoutNode, Rect, TreemapRect};

/// Calcula el peor aspect ratio para una fila de rectángulos colocados a lo largo de un lado `side`.
/// aspect_ratio = max(w/h, h/w) para cada elemento en la fila.
fn worst_aspect_ratio(row: &[f64], side: f64) -> f64 {
    if row.is_empty() || side <= 0.0 {
        return f64::MAX;
    }
    let sum: f64 = row.iter().sum();
    if sum <= 0.0 {
        return f64::MAX;
    }
    let side_sq = side * side;
    let sum_sq = sum * sum;

    let mut worst = 0.0f64;
    for &area in row {
        if area <= 0.0 {
            continue;
        }
        let r1 = (side_sq * area) / sum_sq;
        let r2 = sum_sq / (side_sq * area);
        let ratio = r1.max(r2);
        if ratio > worst {
            worst = ratio;
        }
    }
    if worst == 0.0 {
        f64::MAX
    } else {
        worst
    }
}

/// Distribuye una fila calculada en el contenedor disponible y recorta el contenedor.
fn layout_row(
    row: &[(usize, f64)],
    container: &mut Rect,
    nodes: &[&LayoutNode],
    results: &mut Vec<TreemapRect>,
    depth: u32,
) {
    if row.is_empty() {
        return;
    }

    let row_sum: f64 = row.iter().map(|(_, a)| *a).sum();
    if row_sum <= 0.0 {
        return;
    }

    // Comparamos dimensiones del contenedor disponible
    if container.w < container.h {
        // La fila ocupa todo el ancho (side = container.w)
        let row_height = row_sum / container.w;
        let mut cur_x = container.x;
        for &(idx, area) in row {
            let item_w = area / row_height;
            let node = nodes[idx];
            results.push(TreemapRect {
                path: node.path.clone(),
                name: node.name.clone(),
                rect: Rect {
                    x: cur_x,
                    y: container.y,
                    w: item_w,
                    h: row_height,
                },
                size_bytes: node.size_bytes,
                depth,
                is_directory: node.is_directory,
                extension: node.extension.clone(),
                is_system: node.is_system,
            });
            cur_x += item_w;
        }
        container.y += row_height;
        container.h -= row_height;
    } else {
        // La fila ocupa toda la altura (side = container.h)
        let row_width = row_sum / container.h;
        let mut cur_y = container.y;
        for &(idx, area) in row {
            let item_h = area / row_width;
            let node = nodes[idx];
            results.push(TreemapRect {
                path: node.path.clone(),
                name: node.name.clone(),
                rect: Rect {
                    x: container.x,
                    y: cur_y,
                    w: row_width,
                    h: item_h,
                },
                size_bytes: node.size_bytes,
                depth,
                is_directory: node.is_directory,
                extension: node.extension.clone(),
                is_system: node.is_system,
            });
            cur_y += item_h;
        }
        container.x += row_width;
        container.w -= row_width;
    }
}

/// Implementación del algoritmo Squarified Treemap (Bruls, Huizing, van Wijk 1999).
pub fn squarified_layout(nodes: &[LayoutNode], container: Rect) -> Vec<TreemapRect> {
    squarified_layout_depth(nodes, container, 1)
}

pub fn squarified_layout_depth(nodes: &[LayoutNode], container: Rect, depth: u32) -> Vec<TreemapRect> {
    if nodes.is_empty() || container.w <= 0.0 || container.h <= 0.0 {
        return Vec::new();
    }

    // Filtrar nodos con tamaño positivo
    let mut valid_nodes: Vec<&LayoutNode> = nodes.iter().filter(|n| n.size_bytes > 0).collect();
    if valid_nodes.is_empty() {
        return Vec::new();
    }

    // 1. Ordenar nodos por size_bytes descendente
    valid_nodes.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let total_size: f64 = valid_nodes.iter().map(|n| n.size_bytes as f64).sum();
    let total_area = container.w * container.h;
    if total_size <= 0.0 || total_area <= 0.0 {
        return Vec::new();
    }

    // 2. Normalizar áreas
    let scale = total_area / total_size;
    let normalized_areas: Vec<(usize, f64)> = valid_nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (i, (n.size_bytes as f64) * scale))
        .collect();

    let mut rem_container = container;
    let mut results = Vec::with_capacity(valid_nodes.len());
    let mut current_row: Vec<(usize, f64)> = Vec::new();

    for (idx, area) in normalized_areas {
        let side = rem_container.w.min(rem_container.h);
        if side <= 0.0 {
            break;
        }

        if current_row.is_empty() {
            current_row.push((idx, area));
        } else {
            let row_areas_without: Vec<f64> = current_row.iter().map(|(_, a)| *a).collect();
            let mut row_areas_with = row_areas_without.clone();
            row_areas_with.push(area);

            let score_without = worst_aspect_ratio(&row_areas_without, side);
            let score_with = worst_aspect_ratio(&row_areas_with, side);

            if score_with <= score_without {
                current_row.push((idx, area));
            } else {
                layout_row(&current_row, &mut rem_container, &valid_nodes, &mut results, depth);
                current_row.clear();
                current_row.push((idx, area));
            }
        }
    }

    if !current_row.is_empty() {
        layout_row(&current_row, &mut rem_container, &valid_nodes, &mut results, depth);
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn node(name: &str, size: u64) -> LayoutNode {
        LayoutNode {
            path: format!("/{}", name),
            name: name.to_string(),
            size_bytes: size,
            is_directory: false,
            children: Vec::new(),
            extension: None,
            is_system: false,
        }
    }

    #[test]
    fn test_squarified_10_nodes_no_overlap_and_aspect_ratio() {
        let sizes = [600, 500, 400, 300, 200, 150, 100, 80, 50, 20];
        let nodes: Vec<LayoutNode> = sizes
            .iter()
            .enumerate()
            .map(|(i, &s)| node(&format!("file_{}", i), s))
            .collect();

        let container = Rect {
            x: 0.0,
            y: 0.0,
            w: 800.0,
            h: 600.0,
        };

        let rects = squarified_layout(&nodes, container.clone());
        assert_eq!(rects.len(), 10, "Deben generarse 10 rectángulos");

        // 1. Verificar aspecto ratios < 3.0
        for r in &rects {
            let ratio = if r.rect.w >= r.rect.h {
                r.rect.w / r.rect.h
            } else {
                r.rect.h / r.rect.w
            };
            assert!(
                ratio < 3.0,
                "Aspect ratio para {} es {} (debe ser < 3.0)",
                r.name,
                ratio
            );
        }

        // 2. Verificar que no haya overlap
        let eps = 1e-4;
        for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                let r1 = &rects[i].rect;
                let r2 = &rects[j].rect;

                let overlap_x = (r1.x < r2.x + r2.w - eps) && (r1.x + r1.w - eps > r2.x);
                let overlap_y = (r1.y < r2.y + r2.h - eps) && (r1.y + r1.h - eps > r2.y);

                assert!(
                    !(overlap_x && overlap_y),
                    "Solapamiento detectado entre {} y {}",
                    rects[i].name,
                    rects[j].name
                );
            }
        }
    }

    #[test]
    fn test_squarified_performance_1000_nodes() {
        let nodes: Vec<LayoutNode> = (1..=1000)
            .map(|i| node(&format!("node_{}", i), ((i * 37) % 5000 + 1) as u64))
            .collect();

        let container = Rect {
            x: 0.0,
            y: 0.0,
            w: 1920.0,
            h: 1080.0,
        };

        let start = Instant::now();
        let rects = squarified_layout(&nodes, container);
        let duration = start.elapsed();

        assert_eq!(rects.len(), 1000);
        println!("squarified_layout 1000 nodos tomó: {:?}", duration);
        assert!(
            duration.as_millis() < 5,
            "1000 nodos debe tomar menos de 5ms, tomó {:?}",
            duration
        );
    }
}
