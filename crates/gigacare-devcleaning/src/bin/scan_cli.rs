use std::env;
use gigacare_devcleaning::{scan_dev_caches, scan_ml_models, scan_python_envs};

fn main() {
    let args: Vec<String> = env::args().collect();
    let mode = args.get(1).map(|s| s.as_str()).unwrap_or("dev");

    match mode {
        "dev" => {
            let rep = scan_dev_caches();
            println!("{}", serde_json::to_string(&rep).unwrap());
        }
        "ml" => {
            let rep = scan_ml_models();
            println!("{}", serde_json::to_string(&rep).unwrap());
        }
        "py" => {
            let rep = scan_python_envs();
            println!("{}", serde_json::to_string(&rep).unwrap());
        }
        other => {
            eprintln!("Unknown mode: {}. Use dev, ml, or py", other);
            std::process::exit(1);
        }
    }
}
