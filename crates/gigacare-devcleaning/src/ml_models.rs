use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use serde::Deserialize;

use crate::models::{MlModelEntry, MlModelReport};

#[derive(Debug, Default, Clone)]
pub struct Stamps {
    pub size: u64,
    pub newest_mtime: Option<SystemTime>,
    pub newest_atime: Option<SystemTime>,
}

pub fn days_since(t: Option<SystemTime>) -> Option<u64> {
    t.and_then(|time| {
        SystemTime::now().duration_since(time).ok().map(|d| d.as_secs() / 86400)
    })
}

pub fn secs_epoch(t: Option<SystemTime>) -> u64 {
    t.and_then(|time| {
        time.duration_since(SystemTime::UNIX_EPOCH).ok().map(|d| d.as_secs())
    })
    .unwrap_or(0)
}

pub fn stamps(path: &Path) -> Stamps {
    let mut st = Stamps::default();

    if let Ok(meta) = path.symlink_metadata() {
        if meta.is_file() {
            st.size = meta.len();
            st.newest_mtime = meta.modified().ok();
            st.newest_atime = meta.accessed().ok();
            return st;
        }
    }

    for entry in jwalk::WalkDir::new(path).skip_hidden(false) {
        if let Ok(e) = entry {
            if let Ok(meta) = e.metadata() {
                if meta.is_file() {
                    st.size += meta.len();
                }
                if let Ok(m) = meta.modified() {
                    match st.newest_mtime {
                        None => st.newest_mtime = Some(m),
                        Some(cur) => {
                            if m > cur {
                                st.newest_mtime = Some(m);
                            }
                        }
                    }
                }
                if let Ok(a) = meta.accessed() {
                    match st.newest_atime {
                        None => st.newest_atime = Some(a),
                        Some(cur) => {
                            if a > cur {
                                st.newest_atime = Some(a);
                            }
                        }
                    }
                }
            }
        }
    }

    st
}

pub fn build_entry(
    provider: &str,
    name: &str,
    path: &Path,
    note: Option<String>,
) -> Option<MlModelEntry> {
    let s = stamps(path);
    if s.size == 0 {
        return None;
    }

    let downloaded_days = days_since(s.newest_mtime);
    let last_used_days = days_since(s.newest_atime);
    let used_since_download = secs_epoch(s.newest_atime) > secs_epoch(s.newest_mtime) + 3600;

    Some(MlModelEntry {
        provider: provider.to_string(),
        name: name.to_string(),
        size_bytes: s.size,
        exclusive_bytes: s.size,
        paths: vec![path.to_string_lossy().to_string()],
        downloaded_days,
        last_used_days,
        used_since_download,
        note,
    })
}

pub fn scan_huggingface(home: &Path, out: &mut Vec<MlModelEntry>) {
    let hub_dir = home.join(".cache").join("huggingface").join("hub");
    if !hub_dir.exists() {
        return;
    }

    let entries = match std::fs::read_dir(&hub_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry_res in entries {
        if let Ok(entry) = entry_res {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let (name, is_target) = if let Some(stripped) = file_name.strip_prefix("models--") {
                (stripped.replace("--", "/"), true)
            } else if let Some(stripped) = file_name.strip_prefix("datasets--") {
                (stripped.replace("--", "/"), true)
            } else {
                (String::new(), false)
            };

            if is_target {
                let model_path = entry.path();
                if let Some(m) = build_entry("Hugging Face", &name, &model_path, None) {
                    out.push(m);
                }
            }
        }
    }
}

#[derive(Debug, Deserialize, Default)]
struct OllamaManifest {
    #[serde(default)]
    config: Option<OllamaLayer>,
    #[serde(default)]
    layers: Vec<OllamaLayer>,
}

#[derive(Debug, Deserialize, Default)]
#[allow(dead_code)]
struct OllamaLayer {
    #[serde(default)]
    digest: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

pub fn digest_to_blob(blobs_dir: &Path, digest: &str) -> PathBuf {
    blobs_dir.join(digest.replace(':', "-"))
}

pub fn scan_ollama(home: &Path, out: &mut Vec<MlModelEntry>) {
    let ollama_dir = home.join(".ollama").join("models");
    let manifests_dir = ollama_dir.join("manifests");
    let blobs_dir = ollama_dir.join("blobs");

    if !manifests_dir.exists() {
        return;
    }

    struct ParsedOllamaModel {
        manifest_path: PathBuf,
        relative_name: String,
        digests: Vec<String>,
        manifest_mtime: Option<SystemTime>,
        manifest_atime: Option<SystemTime>,
    }

    let mut parsed_models = Vec::new();
    let mut ref_counts: HashMap<String, usize> = HashMap::new();

    for entry in jwalk::WalkDir::new(&manifests_dir).skip_hidden(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(manifest) = serde_json::from_str::<OllamaManifest>(&content) {
                    let mut digests = Vec::new();
                    if let Some(cfg) = manifest.config {
                        if let Some(d) = cfg.digest {
                            digests.push(d);
                        }
                    }
                    for l in manifest.layers {
                        if let Some(d) = l.digest {
                            digests.push(d);
                        }
                    }

                    for d in &digests {
                        *ref_counts.entry(d.clone()).or_insert(0) += 1;
                    }

                    // Extract relative name as "model:tag" from the last 2 components
                    let rel = path.strip_prefix(&manifests_dir).unwrap_or(&path);
                    let components: Vec<_> = rel
                        .components()
                        .map(|c| c.as_os_str().to_string_lossy().to_string())
                        .collect();

                    let relative_name = if components.len() >= 2 {
                        let len = components.len();
                        format!("{}:{}", components[len - 2], components[len - 1])
                    } else {
                        rel.to_string_lossy().to_string()
                    };

                    let meta = path.symlink_metadata().ok();
                    let manifest_mtime = meta.as_ref().and_then(|m| m.modified().ok());
                    let manifest_atime = meta.as_ref().and_then(|m| m.accessed().ok());

                    parsed_models.push(ParsedOllamaModel {
                        manifest_path: path.to_path_buf(),
                        relative_name,
                        digests,
                        manifest_mtime,
                        manifest_atime,
                    });
                }
            }
        }
    }

    for model in parsed_models {
        let mut total_bytes = 0u64;
        let mut exclusive_bytes = 0u64;
        let mut shared_count = 0usize;
        let mut paths = vec![model.manifest_path.to_string_lossy().to_string()];

        for digest in &model.digests {
            let blob_path = digest_to_blob(&blobs_dir, digest);
            let blob_size = blob_path.symlink_metadata().map(|m| m.len()).unwrap_or(0);
            total_bytes += blob_size;

            let refs = ref_counts.get(digest).copied().unwrap_or(0);
            if refs <= 1 {
                exclusive_bytes += blob_size;
                if blob_path.exists() {
                    paths.push(blob_path.to_string_lossy().to_string());
                }
            } else {
                shared_count += 1;
            }
        }

        let note = if shared_count > 0 {
            Some(format!(
                "{} layer(s) are shared with other Ollama models and are kept",
                shared_count
            ))
        } else {
            None
        };

        let downloaded_days = days_since(model.manifest_mtime);
        let last_used_days = days_since(model.manifest_atime);
        let used_since_download =
            secs_epoch(model.manifest_atime) > secs_epoch(model.manifest_mtime) + 3600;

        out.push(MlModelEntry {
            provider: "Ollama".to_string(),
            name: model.relative_name,
            size_bytes: total_bytes,
            exclusive_bytes,
            paths,
            downloaded_days,
            last_used_days,
            used_since_download,
            note,
        });
    }
}

pub fn scan_checkpoint_dir(
    dir: &Path,
    provider: &str,
    exts: &[&str],
    out: &mut Vec<MlModelEntry>,
) {
    if !dir.exists() {
        return;
    }

    for entry in jwalk::WalkDir::new(dir).skip_hidden(false).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let matches_ext = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| {
                    let lower = ext.to_lowercase();
                    exts.iter().any(|&e| e.eq_ignore_ascii_case(&lower))
                })
                .unwrap_or(false);

            if matches_ext {
                if let Ok(meta) = path.symlink_metadata() {
                    let size_bytes = meta.len();
                    if size_bytes == 0 {
                        continue;
                    }

                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "model".to_string());

                    let mtime = meta.modified().ok();
                    let atime = meta.accessed().ok();
                    let downloaded_days = days_since(mtime);
                    let last_used_days = days_since(atime);
                    let used_since_download = secs_epoch(atime) > secs_epoch(mtime) + 3600;

                    out.push(MlModelEntry {
                        provider: provider.to_string(),
                        name,
                        size_bytes,
                        exclusive_bytes: size_bytes,
                        paths: vec![path.to_string_lossy().to_string()],
                        downloaded_days,
                        last_used_days,
                        used_since_download,
                        note: None,
                    });
                }
            }
        }
    }
}

pub fn scan_ml_models() -> MlModelReport {
    let mut models = Vec::new();

    if let Some(home) = dirs::home_dir() {
        scan_huggingface(&home, &mut models);
        scan_ollama(&home, &mut models);
        scan_checkpoint_dir(
            &home.join(".cache").join("whisper"),
            "Whisper",
            &["pt"],
            &mut models,
        );
        scan_checkpoint_dir(
            &home.join(".cache").join("torch").join("hub").join("checkpoints"),
            "PyTorch",
            &["pth", "pt", "bin"],
            &mut models,
        );
        scan_checkpoint_dir(
            &home.join(".keras").join("models"),
            "Keras",
            &["h5", "keras"],
            &mut models,
        );
    }

    models.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let total_bytes = models.iter().map(|m| m.size_bytes).sum();
    let unused_bytes = models
        .iter()
        .filter(|m| !m.used_since_download)
        .map(|m| m.size_bytes)
        .sum();
    let usage_tracking_reliable = models.iter().any(|m| m.used_since_download);

    MlModelReport {
        total_bytes,
        unused_bytes,
        usage_tracking_reliable,
        models,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_huggingface_mock() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();
        let hub_dir = home.join(".cache").join("huggingface").join("hub");
        std::fs::create_dir_all(&hub_dir).unwrap();

        let model_dir = hub_dir.join("models--meta-llama--Llama-3.2-3B");
        std::fs::create_dir_all(&model_dir).unwrap();
        std::fs::write(model_dir.join("model.bin"), b"12345678").unwrap();

        let mut out = Vec::new();
        scan_huggingface(home, &mut out);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].provider, "Hugging Face");
        assert_eq!(out[0].name, "meta-llama/Llama-3.2-3B");
        assert_eq!(out[0].size_bytes, 8);
    }

    #[test]
    fn test_scan_ollama_shared_layers_refcount() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();
        let manifests = home.join(".ollama").join("models").join("manifests").join("library");
        let blobs = home.join(".ollama").join("models").join("blobs");
        std::fs::create_dir_all(manifests.join("llama3")).unwrap();
        std::fs::create_dir_all(manifests.join("mistral")).unwrap();
        std::fs::create_dir_all(&blobs).unwrap();

        let shared_blob = "sha256-shared123";
        let llama_exclusive_blob = "sha256-llama456";
        let mistral_exclusive_blob = "sha256-mistral789";

        std::fs::write(blobs.join(shared_blob), vec![0u8; 1000]).unwrap();
        std::fs::write(blobs.join(llama_exclusive_blob), vec![0u8; 500]).unwrap();
        std::fs::write(blobs.join(mistral_exclusive_blob), vec![0u8; 300]).unwrap();

        let llama_manifest = serde_json::json!({
            "config": { "digest": "sha256:shared123" },
            "layers": [
                { "digest": "sha256:llama456" }
            ]
        });
        std::fs::write(manifests.join("llama3").join("latest"), llama_manifest.to_string()).unwrap();

        let mistral_manifest = serde_json::json!({
            "config": { "digest": "sha256:shared123" },
            "layers": [
                { "digest": "sha256:mistral789" }
            ]
        });
        std::fs::write(manifests.join("mistral").join("latest"), mistral_manifest.to_string()).unwrap();

        let mut out = Vec::new();
        scan_ollama(home, &mut out);

        assert_eq!(out.len(), 2);
        let llama = out.iter().find(|m| m.name == "llama3:latest").unwrap();
        let mistral = out.iter().find(|m| m.name == "mistral:latest").unwrap();

        assert_eq!(llama.size_bytes, 1500); // 1000 shared + 500 exclusive
        assert_eq!(llama.exclusive_bytes, 500);
        assert!(llama.exclusive_bytes < llama.size_bytes);
        assert!(llama.note.as_ref().unwrap().contains("shared with other Ollama models"));

        assert_eq!(mistral.size_bytes, 1300); // 1000 shared + 300 exclusive
        assert_eq!(mistral.exclusive_bytes, 300);
        assert!(mistral.exclusive_bytes < mistral.size_bytes);
    }


}
