pub mod models;
pub mod rules;
pub mod scanner;
pub mod ml_models;
pub mod python_envs;

pub use models::*;
pub use rules::{all_rules, Rule};
pub use scanner::scan_dev_caches;
pub use ml_models::scan_ml_models;
pub use python_envs::scan_python_envs;

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn smoke_scan_dev_caches() {
        let report = scan_dev_caches();
        println!("=== DEV CACHES SMOKE TEST ===");
        println!("Disk total: {} bytes, free: {} bytes", report.disk_total, report.disk_free);
        println!("Findings count: {}", report.findings.len());
        for f in &report.findings {
            println!("  [{}] {}: {} bytes (stale_days: {:?})", f.rule_id, f.name, f.size_bytes, f.stale_days);
        }
        assert!(report.disk_total > 0, "disk_total must be > 0");
    }

    #[test]
    fn smoke_model_scan() {
        let report = scan_ml_models();
        println!("=== ML MODELS SMOKE TEST ===");
        println!("Total: {} bytes, unused: {} bytes, reliable: {}", report.total_bytes, report.unused_bytes, report.usage_tracking_reliable);
        println!("Models count: {}", report.models.len());
        for m in &report.models {
            println!("  [{}] {}: {} bytes (exclusive: {} bytes, note: {:?})", m.provider, m.name, m.size_bytes, m.exclusive_bytes, m.note);
        }
        assert!(report.total_bytes >= report.unused_bytes);
    }

    #[test]
    fn smoke_python_scan() {
        let report = scan_python_envs();
        println!("=== PYTHON ENVS SMOKE TEST ===");
        println!("Total: {} bytes, wasted: {} bytes", report.total_bytes, report.wasted_bytes);
        println!("Envs count: {}, Duplicates count: {}", report.envs.len(), report.duplicates.len());
        for env in &report.envs {
            println!("  [{}] {}: {} bytes ({} pkgs)", env.kind, env.name, env.size_bytes, env.packages.len());
        }
        for dup in &report.duplicates {
            println!("  Duplicate {}: {} copies, wasted: {} bytes", dup.name, dup.copies, dup.wasted_bytes);
        }
        assert!(report.total_bytes >= report.wasted_bytes);
    }

    #[test]
    fn rules_count() {
        assert_eq!(all_rules().len(), 25, "Must have exactly 25 rules");
    }

    #[test]
    fn rules_unique_ids() {
        let rules = all_rules();
        let mut ids = HashSet::new();
        for r in rules {
            assert!(ids.insert(r.id), "Rule id {} duplicated", r.id);
        }
    }
}
