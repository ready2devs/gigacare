use crate::models::{LayoutNode, Point, SunburstArc};
use std::f64::consts::PI;

const MIN_SWEEP_RAD: f64 = 0.001;

/// Algoritmo Sunburst partition (visualización radial multinivel).
pub fn sunburst_layout(
    root: &LayoutNode,
    center: Point,
    inner_radius: f64,
    ring_width: f64,
    max_depth: usize,
) -> Vec<SunburstArc> {
    let mut arcs = Vec::new();

    if root.size_bytes == 0 || max_depth == 0 {
        return arcs;
    }

    // Nivel 0 (raíz)
    let root_arc = SunburstArc {
        path: root.path.clone(),
        name: root.name.clone(),
        center: center.clone(),
        r_inner: inner_radius,
        r_outer: inner_radius + ring_width,
        start_angle: 0.0,
        end_angle: 2.0 * PI,
        depth: 0,
        size_bytes: root.size_bytes,
        is_directory: root.is_directory,
    };
    arcs.push(root_arc);

    if max_depth > 1 && !root.children.is_empty() {
        recurse_children(
            &root.children,
            root.size_bytes,
            0.0,
            2.0 * PI,
            1,
            max_depth,
            &center,
            inner_radius,
            ring_width,
            &mut arcs,
        );
    }

    arcs
}

fn recurse_children(
    children: &[LayoutNode],
    parent_size: u64,
    parent_start: f64,
    parent_end: f64,
    current_depth: usize,
    max_depth: usize,
    center: &Point,
    inner_radius: f64,
    ring_width: f64,
    arcs: &mut Vec<SunburstArc>,
) {
    if current_depth >= max_depth || parent_size == 0 || children.is_empty() {
        return;
    }

    let parent_sweep = parent_end - parent_start;
    if parent_sweep < MIN_SWEEP_RAD {
        return;
    }

    let total_children_size: u64 = children.iter().map(|c| c.size_bytes).sum();
    if total_children_size == 0 {
        return;
    }

    // Usamos el total_children_size o parent_size para escalar proporcionalmente
    let base_size = parent_size.max(total_children_size) as f64;
    let mut current_angle = parent_start;

    let r_inner = inner_radius + (current_depth as f64) * ring_width;
    let r_outer = r_inner + ring_width;

    for child in children {
        if child.size_bytes == 0 {
            continue;
        }

        let child_fraction = (child.size_bytes as f64) / base_size;
        let child_sweep = child_fraction * parent_sweep;

        if child_sweep < MIN_SWEEP_RAD {
            current_angle += child_sweep;
            continue;
        }

        let start_angle = current_angle;
        let end_angle = current_angle + child_sweep;

        arcs.push(SunburstArc {
            path: child.path.clone(),
            name: child.name.clone(),
            center: center.clone(),
            r_inner,
            r_outer,
            start_angle,
            end_angle,
            depth: current_depth as u32,
            size_bytes: child.size_bytes,
            is_directory: child.is_directory,
        });

        if !child.children.is_empty() && (current_depth + 1) < max_depth {
            recurse_children(
                &child.children,
                child.size_bytes,
                start_angle,
                end_angle,
                current_depth + 1,
                max_depth,
                center,
                inner_radius,
                ring_width,
                arcs,
            );
        }

        current_angle = end_angle;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node(name: &str, size: u64, children: Vec<LayoutNode>) -> LayoutNode {
        LayoutNode {
            path: format!("/{}", name),
            name: name.to_string(),
            size_bytes: size,
            is_directory: !children.is_empty(),
            children,
            extension: None,
            is_system: false,
        }
    }

    #[test]
    fn test_sunburst_3_levels_sweep_conservation_and_no_overlap() {
        // Nivel 2 (nietos)
        let g1 = make_node("g1", 200, vec![]);
        let g2 = make_node("g2", 300, vec![]);
        let g3 = make_node("g3", 100, vec![]);
        let g4 = make_node("g4", 400, vec![]);

        // Nivel 1 (hijos)
        let c1 = make_node("c1", 500, vec![g1, g2]); // sum = 500
        let c2 = make_node("c2", 500, vec![g3, g4]); // sum = 500

        // Nivel 0 (raíz)
        let root = make_node("root", 1000, vec![c1, c2]); // sum = 1000

        let center = Point { x: 500.0, y: 500.0 };
        let arcs = sunburst_layout(&root, center, 50.0, 40.0, 3);

        // Nivel 0: 1 arco (root)
        let level0: Vec<&SunburstArc> = arcs.iter().filter(|a| a.depth == 0).collect();
        assert_eq!(level0.len(), 1);
        let root_sweep = level0[0].end_angle - level0[0].start_angle;
        let eps = 1e-6;
        assert!((root_sweep - 2.0 * PI).abs() < eps);

        // Nivel 1: 2 arcos (c1, c2)
        let level1: Vec<&SunburstArc> = arcs.iter().filter(|a| a.depth == 1).collect();
        assert_eq!(level1.len(), 2);
        let level1_sum: f64 = level1.iter().map(|a| a.end_angle - a.start_angle).sum();
        assert!((level1_sum - root_sweep).abs() < eps, "Suma de sweeps de hijos debe igualar raíz");

        // Nivel 2: 4 arcos (g1, g2, g3, g4)
        let level2: Vec<&SunburstArc> = arcs.iter().filter(|a| a.depth == 2).collect();
        assert_eq!(level2.len(), 4);

        // Nietos de c1 (g1 + g2) deben sumar el sweep de c1
        let c1_arc = level1.iter().find(|a| a.name == "c1").unwrap();
        let c1_sweep = c1_arc.end_angle - c1_arc.start_angle;
        let c1_children_sweep: f64 = level2
            .iter()
            .filter(|a| a.name == "g1" || a.name == "g2")
            .map(|a| a.end_angle - a.start_angle)
            .sum();
        assert!(
            (c1_children_sweep - c1_sweep).abs() < eps,
            "Suma de sweep de nietos de c1 ({}) debe igualar sweep de c1 ({})",
            c1_children_sweep,
            c1_sweep
        );

        // Sin overlaps angulares en cada nivel
        for lvl in [1, 2] {
            let nodes_in_lvl: Vec<&SunburstArc> = arcs.iter().filter(|a| a.depth == lvl).collect();
            for i in 0..nodes_in_lvl.len() {
                for j in (i + 1)..nodes_in_lvl.len() {
                    let a1 = nodes_in_lvl[i];
                    let a2 = nodes_in_lvl[j];
                    let overlap = (a1.start_angle < a2.end_angle - eps) && (a1.end_angle - eps > a2.start_angle);
                    assert!(!overlap, "Solapamiento angular detectado entre {} y {}", a1.name, a2.name);
                }
            }
        }
    }

    #[test]
    fn test_sunburst_skips_tiny_arcs() {
        let tiny = make_node("tiny", 1, vec![]);
        let normal = make_node("normal", 10_000_000, vec![]);
        let root = make_node("root", 10_000_001, vec![tiny, normal]);

        let center = Point { x: 0.0, y: 0.0 };
        let arcs = sunburst_layout(&root, center, 20.0, 20.0, 2);

        // tiny debería ser saltado (< 0.001 rad)
        let tiny_arc = arcs.iter().find(|a| a.name == "tiny");
        assert!(tiny_arc.is_none(), "El arco diminuto debe ser descartado");
    }
}
