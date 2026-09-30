use std::path::PathBuf;
use crate::models::{DevCategory, DevSafety};

#[derive(Debug, Clone)]
pub struct Rule {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: DevCategory,
    pub safety: DevSafety,
}

impl Rule {
    pub fn paths(&self) -> Vec<PathBuf> {
        let home = dirs::home_dir();
        let cache = dirs::cache_dir();

        match self.id {
            "hf-hub" => {
                let mut v = Vec::new();
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("huggingface"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("huggingface"));
                }
                v
            }
            "ollama" => {
                home.map(|h| vec![h.join(".ollama").join("models")])
                    .unwrap_or_default()
            }
            "torch" => {
                home.map(|h| vec![h.join(".cache").join("torch")])
                    .unwrap_or_default()
            }
            "keras" => {
                home.map(|h| vec![h.join(".keras").join("models")])
                    .unwrap_or_default()
            }
            "whisper" => {
                home.map(|h| vec![h.join(".cache").join("whisper")])
                    .unwrap_or_default()
            }
            "lm-studio" => {
                let mut v = Vec::new();
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("lm-studio").join("models"));
                    v.push(h.join(".lmstudio").join("models"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("lm-studio").join("models"));
                }
                v
            }
            "conda-pkgs" => {
                let mut v = Vec::new();
                if let Some(ref h) = home {
                    v.push(h.join("miniconda3").join("pkgs"));
                    v.push(h.join("anaconda3").join("pkgs"));
                    v.push(h.join("miniforge3").join("pkgs"));
                    v.push(h.join(".conda").join("pkgs"));
                }
                v
            }
            "conda-envs" => {
                let mut v = Vec::new();
                if let Some(ref h) = home {
                    v.push(h.join("miniconda3").join("envs"));
                    v.push(h.join("anaconda3").join("envs"));
                    v.push(h.join("miniforge3").join("envs"));
                }
                v
            }
            "pip" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("pip").join("Cache"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("pip"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("pip"));
                }
                v
            }
            "uv" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("uv").join("cache"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("uv"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("uv"));
                }
                v
            }
            "npm" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                {
                    if let Some(ref c) = cache {
                        v.push(c.join("npm-cache"));
                    }
                    if let Ok(appdata) = std::env::var("APPDATA") {
                        v.push(PathBuf::from(appdata).join("npm-cache"));
                    }
                }
                #[cfg(not(target_os = "windows"))]
                if let Some(ref h) = home {
                    v.push(h.join(".npm"));
                }
                v
            }
            "yarn" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("Yarn").join("Cache"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("Yarn"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("yarn"));
                }
                v
            }
            "pnpm" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("pnpm").join("store"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref h) = home {
                    v.push(h.join("Library").join("pnpm").join("store"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".local").join("share").join("pnpm").join("store"));
                }
                v
            }
            "cargo-registry" => {
                home.map(|h| vec![h.join(".cargo").join("registry")])
                    .unwrap_or_default()
            }
            "go-mod" => {
                home.map(|h| vec![h.join("go").join("pkg").join("mod")])
                    .unwrap_or_default()
            }
            "gradle" => {
                home.map(|h| vec![h.join(".gradle").join("caches")])
                    .unwrap_or_default()
            }
            "maven" => {
                home.map(|h| vec![h.join(".m2").join("repository")])
                    .unwrap_or_default()
            }
            "nuget" => {
                home.map(|h| vec![h.join(".nuget").join("packages")])
                    .unwrap_or_default()
            }
            "homebrew" => {
                #[cfg(target_os = "macos")]
                {
                    cache.map(|c| vec![c.join("Homebrew")]).unwrap_or_default()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    Vec::new()
                }
            }
            "xcode-derived" => {
                #[cfg(target_os = "macos")]
                {
                    home.map(|h| vec![h.join("Library").join("Developer").join("Xcode").join("DerivedData")])
                        .unwrap_or_default()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    Vec::new()
                }
            }
            "xcode-archives" => {
                #[cfg(target_os = "macos")]
                {
                    home.map(|h| vec![h.join("Library").join("Developer").join("Xcode").join("Archives")])
                        .unwrap_or_default()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    Vec::new()
                }
            }
            "docker" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("Docker").join("wsl"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref h) = home {
                    v.push(h.join("Library").join("Containers").join("com.docker.docker").join("Data"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                {
                    v.push(PathBuf::from("/var/lib/docker"));
                }
                v
            }
            "jetbrains" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("JetBrains"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("JetBrains"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("JetBrains"));
                }
                v
            }
            "playwright" => {
                let mut v = Vec::new();
                #[cfg(target_os = "windows")]
                if let Some(ref c) = cache {
                    v.push(c.join("ms-playwright"));
                }
                #[cfg(target_os = "macos")]
                if let Some(ref c) = cache {
                    v.push(c.join("ms-playwright"));
                }
                #[cfg(all(unix, not(target_os = "macos")))]
                if let Some(ref h) = home {
                    v.push(h.join(".cache").join("ms-playwright"));
                }
                v
            }
            "puppeteer" => {
                home.map(|h| vec![h.join(".cache").join("puppeteer")])
                    .unwrap_or_default()
            }
            _ => Vec::new(),
        }
    }
}

pub fn all_rules() -> Vec<Rule> {
    vec![
        Rule {
            id: "hf-hub",
            name: "Hugging Face cache",
            description: "Downloaded model weights and dataset caches from Hugging Face hub",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "ollama",
            name: "Ollama models",
            description: "Locally stored Ollama model weights, manifests, and layers",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "torch",
            name: "PyTorch hub cache",
            description: "Downloaded PyTorch model weights and checkpoints",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "keras",
            name: "Keras models",
            description: "Downloaded Keras and TensorFlow model weights",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "whisper",
            name: "Whisper models",
            description: "Downloaded OpenAI Whisper speech recognition models",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "lm-studio",
            name: "LM Studio models",
            description: "Model weights downloaded via LM Studio",
            category: DevCategory::MlModels,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "conda-pkgs",
            name: "Conda package cache",
            description: "Downloaded Conda packages and tarball archives",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "conda-envs",
            name: "Conda environments",
            description: "Installed Conda environments and packages",
            category: DevCategory::AppData,
            safety: DevSafety::Risky,
        },
        Rule {
            id: "pip",
            name: "Pip cache",
            description: "Cached Python wheel and source packages",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "uv",
            name: "uv cache",
            description: "Astral uv fast Python package manager cache",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "npm",
            name: "npm cache",
            description: "Node Package Manager tarball and metadata cache",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "yarn",
            name: "Yarn cache",
            description: "Yarn package manager global cache",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "pnpm",
            name: "pnpm store",
            description: "Content-addressable package store for pnpm",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "cargo-registry",
            name: "Cargo registry",
            description: "Rust crates.io index and downloaded .crate files",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "go-mod",
            name: "Go module cache",
            description: "Downloaded Go modules and checksum database",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "gradle",
            name: "Gradle caches",
            description: "Downloaded dependencies and build caches for Gradle",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "maven",
            name: "Maven repository",
            description: "Local repository for downloaded Maven artifacts",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "nuget",
            name: "NuGet packages",
            description: "Global packages folder for .NET NuGet dependencies",
            category: DevCategory::DevCache,
            safety: DevSafety::Caution,
        },
        Rule {
            id: "homebrew",
            name: "Homebrew cache",
            description: "Homebrew formula and bottle downloads",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "xcode-derived",
            name: "Xcode DerivedData",
            description: "Intermediate build files and indexing data for Xcode",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "xcode-archives",
            name: "Xcode archives",
            description: "Xcode build archives and crash logs",
            category: DevCategory::AppData,
            safety: DevSafety::Risky,
        },
        Rule {
            id: "docker",
            name: "Docker VM data",
            description: "Docker Desktop and WSL virtual disk data",
            category: DevCategory::AppData,
            safety: DevSafety::Risky,
        },
        Rule {
            id: "jetbrains",
            name: "JetBrains caches",
            description: "JetBrains IDE indexes, caches, and logs",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "playwright",
            name: "Playwright browsers",
            description: "Downloaded browser binaries for Playwright automation",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
        Rule {
            id: "puppeteer",
            name: "Puppeteer browsers",
            description: "Downloaded Chromium and browser binaries for Puppeteer",
            category: DevCategory::DevCache,
            safety: DevSafety::Safe,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_all_rules_count_and_unique_ids() {
        let rules = all_rules();
        assert_eq!(rules.len(), 25, "Expected exactly 25 rules");

        let mut seen = HashSet::new();
        for r in &rules {
            assert!(
                seen.insert(r.id),
                "Duplicate rule id found: {}",
                r.id
            );
            assert!(!r.name.is_empty(), "Rule {} has empty name", r.id);
            assert!(!r.description.is_empty(), "Rule {} has empty description", r.id);
        }
    }
}
