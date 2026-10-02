//! Módulo orquestador de escaneo de archivos basura (Junk Files).
//!
//! Centraliza y agrupa los resultados de escaneo de:
//! - Temporales del sistema y usuario (%TEMP%, crash dumps, thumbcache)
//! - Restos del sistema Windows (Windows Update, Delivery Optimization, WER, Windows.old)
//! - Prefetch (marcado como informacional)
//! - Instaladores en Descargas (.exe, .msi, etc.)
//! - Cachés de navegadores web (Chrome, Edge, Firefox, Brave, Opera, Vivaldi)
//! - Cachés de mensajería (WhatsApp, Telegram)
//! - Residuos de desinstalación de aplicaciones

use std::sync::atomic::AtomicBool;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::Result;
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ScanFilters, ScanItem};
use crate::scanner::browsers::{self, BrowserCacheProfile};
use crate::scanner::installers::InstallersScanner;
use crate::scanner::messaging::MessagingScanner;
use crate::scanner::system::SystemScanner;
use crate::scanner::uninstaller::UninstallerScanner;
use crate::scanner::{check_cancelled, ScannerModule};

// ─────────────────────────── Modelos de Datos ──────────────────────

/// Item individual de archivo basura.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JunkItem {
    pub id: String,
    pub display_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub safe: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_days: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub age_display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
}

/// Categoría de archivos basura dentro del módulo unificado.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JunkCategory {
    pub category_id: String,
    pub display_name: String,
    pub total_bytes: u64,
    pub safe_bytes: u64,
    pub items: Vec<JunkItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub informational: Option<bool>,
}

/// Resultado global del escaneo de archivos basura.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JunkFilesScanResult {
    pub total_junk_bytes: u64,
    pub categories: Vec<JunkCategory>,
    pub browsers: Vec<BrowserCacheProfile>,
    pub scan_timestamp: String,
}

// ─────────────────────────── JunkFilesScanner ─────────────────────

/// Orquestador para escanear todas las categorías de archivos basura.
pub struct JunkFilesScanner;

impl JunkFilesScanner {
    /// Convierte un `ScanItem` genérico en un `JunkItem`.
    pub fn scan_item_to_junk_item(item: &ScanItem) -> JunkItem {
        let file_name = std::path::Path::new(&item.path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&item.path)
            .to_string();

        let source_type = item
            .metadata
            .extra
            .get("source_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let safe = item
            .metadata
            .extra
            .get("safe")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                source_type.as_deref() != Some("prefetch")
            });

        let age_display = item
            .metadata
            .extra
            .get("age_display")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                item.metadata
                    .days_inactive
                    .map(SystemScanner::format_age_display)
            });

        JunkItem {
            id: item.path.clone(),
            display_name: file_name,
            path: item.path.clone(),
            size_bytes: item.size_bytes,
            safe,
            age_days: item.metadata.days_inactive,
            age_display,
            source_type,
        }
    }

    /// Ejecuta el escaneo unificado de todas las categorías de archivos basura.
    pub async fn scan(
        config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        filters: Option<&ScanFilters>,
    ) -> Result<JunkFilesScanResult> {
        check_cancelled(cancel)?;

        let mut categories = Vec::new();
        let mut total_junk_bytes: u64 = 0;

        // 1. Escanear Sistema (%TEMP%, Restos Windows, Prefetch)
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::SystemTemp,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 5.0,
                eta_seconds: None,
            })
            .await;

        let system_scanner = SystemScanner::new();
        let system_result = system_scanner.scan(config, cancel, tx, filters).await?;

        let mut temp_items = Vec::new();
        let mut leftovers_items = Vec::new();
        let mut prefetch_items = Vec::new();

        for item in &system_result.items {
            let junk_item = Self::scan_item_to_junk_item(item);
            let st = junk_item.source_type.as_deref().unwrap_or("");

            match st {
                "windows_update" | "delivery_optimization" | "windows_old" | "error_reporting" => {
                    leftovers_items.push(junk_item);
                }
                "prefetch" => {
                    prefetch_items.push(junk_item);
                }
                _ => {
                    temp_items.push(junk_item);
                }
            }
        }

        // Categoría Archivos Temporales
        let temp_total: u64 = temp_items.iter().map(|i| i.size_bytes).sum();
        let temp_safe: u64 = temp_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "temp_files".to_string(),
            display_name: "Archivos Temporales".to_string(),
            total_bytes: temp_total,
            safe_bytes: temp_safe,
            items: temp_items,
            informational: None,
        });

        // Categoría Restos de Windows
        let leftovers_total: u64 = leftovers_items.iter().map(|i| i.size_bytes).sum();
        let leftovers_safe: u64 = leftovers_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "windows_leftovers".to_string(),
            display_name: "Restos de Windows".to_string(),
            total_bytes: leftovers_total,
            safe_bytes: leftovers_safe,
            items: leftovers_items,
            informational: None,
        });

        // Categoría Prefetch (informational = true)
        let prefetch_total: u64 = prefetch_items.iter().map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "prefetch".to_string(),
            display_name: "Prefetch".to_string(),
            total_bytes: prefetch_total,
            safe_bytes: 0,
            items: prefetch_items,
            informational: Some(true),
        });

        // 2. Escanear Instaladores en Descargas
        check_cancelled(cancel)?;
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::Installers,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 30.0,
                eta_seconds: None,
            })
            .await;

        let installers_scanner = InstallersScanner::new();
        let installers_result = installers_scanner.scan(config, cancel, tx, filters).await?;

        let installer_items: Vec<JunkItem> = installers_result
            .items
            .iter()
            .map(|item| {
                let mut ji = Self::scan_item_to_junk_item(item);
                ji.safe = true;
                ji.source_type = Some("download_installer".to_string());
                ji
            })
            .collect();

        let installers_total: u64 = installer_items.iter().map(|i| i.size_bytes).sum();
        let installers_safe: u64 = installer_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "download_installers".to_string(),
            display_name: "Instaladores en Descargas".to_string(),
            total_bytes: installers_total,
            safe_bytes: installers_safe,
            items: installer_items,
            informational: None,
        });

        // 3. Escanear Cachés de Navegadores Web
        check_cancelled(cancel)?;
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 50.0,
                eta_seconds: None,
            })
            .await;

        let browsers = browsers::scan_browser_caches();
        let browsers_total: u64 = browsers.iter().map(|b| b.total_all_profiles_bytes).sum();

        let mut browser_items = Vec::new();
        for b in &browsers {
            if !b.installed {
                continue;
            }
            for profile in &b.profiles {
                for entry in &profile.cache_entries {
                    browser_items.push(JunkItem {
                        id: entry.path.clone(),
                        display_name: format!("{} ({})", b.browser_name, entry.display_name),
                        path: entry.path.clone(),
                        size_bytes: entry.size_bytes,
                        safe: entry.safe,
                        age_days: None,
                        age_display: None,
                        source_type: Some(format!("browser_{}", entry.cache_type)),
                    });
                }
            }
        }

        let browser_safe: u64 = browser_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "browser_caches".to_string(),
            display_name: "Cachés de Navegadores".to_string(),
            total_bytes: browsers_total,
            safe_bytes: browser_safe,
            items: browser_items,
            informational: None,
        });

        // 4. Escanear Cachés de Mensajería
        check_cancelled(cancel)?;
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::MessagingCache,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 70.0,
                eta_seconds: None,
            })
            .await;

        let messaging_scanner = MessagingScanner::new();
        let messaging_result = messaging_scanner.scan(config, cancel, tx, filters).await?;

        let messaging_items: Vec<JunkItem> = messaging_result
            .items
            .iter()
            .map(|item| {
                let mut ji = Self::scan_item_to_junk_item(item);
                ji.safe = true;
                ji
            })
            .collect();

        let messaging_total: u64 = messaging_items.iter().map(|i| i.size_bytes).sum();
        let messaging_safe: u64 = messaging_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "messaging_cache".to_string(),
            display_name: "Cachés de Mensajería".to_string(),
            total_bytes: messaging_total,
            safe_bytes: messaging_safe,
            items: messaging_items,
            informational: None,
        });

        // 5. Escanear Residuales de Aplicaciones
        check_cancelled(cancel)?;
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::UninstallResiduals,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 90.0,
                eta_seconds: None,
            })
            .await;

        let uninstaller_scanner = UninstallerScanner::with_defaults();
        let uninstaller_result = uninstaller_scanner.scan(config, cancel, tx, filters).await?;

        let residual_items: Vec<JunkItem> = uninstaller_result
            .items
            .iter()
            .map(|item| {
                let mut ji = Self::scan_item_to_junk_item(item);
                ji.safe = false;
                ji.source_type = Some("app_residual".to_string());
                ji
            })
            .collect();

        let residual_total: u64 = residual_items.iter().map(|i| i.size_bytes).sum();
        let residual_safe: u64 = residual_items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();
        categories.push(JunkCategory {
            category_id: "app_residuals".to_string(),
            display_name: "Residuales de Aplicaciones".to_string(),
            total_bytes: residual_total,
            safe_bytes: residual_safe,
            items: residual_items,
            informational: None,
        });

        // Calcular total global
        for cat in &categories {
            total_junk_bytes += cat.total_bytes;
        }

        // Emitir progreso final 100%
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::SystemTemp,
                items_scanned: categories.iter().map(|c| c.items.len() as u64).sum(),
                items_found: categories.iter().map(|c| c.items.len() as u64).sum(),
                bytes_found: total_junk_bytes,
                percent: 100.0,
                eta_seconds: Some(0),
            })
            .await;

        Ok(JunkFilesScanResult {
            total_junk_bytes,
            categories,
            browsers,
            scan_timestamp: Utc::now().to_rfc3339(),
        })
    }
}

// ─────────────────────────── Tests ────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use crate::models::{ItemMetadata, ItemCategory};

    #[test]
    fn test_scan_item_to_junk_item() {
        let mut extra = HashMap::new();
        extra.insert("source_type".to_string(), serde_json::Value::String("temp_user".to_string()));
        extra.insert("safe".to_string(), serde_json::Value::Bool(true));
        extra.insert("age_display".to_string(), serde_json::Value::String("2 meses".to_string()));

        let scan_item = ScanItem {
            path: r"C:\Users\test\AppData\Local\Temp\foo.tmp".to_string(),
            size_bytes: 1024,
            modified_at: Utc::now(),
            category: ItemCategory::Temp,
            metadata: ItemMetadata {
                app_source: Some("system".to_string()),
                project_name: None,
                days_inactive: Some(60),
                extra,
            },
        };

        let junk_item = JunkFilesScanner::scan_item_to_junk_item(&scan_item);
        assert_eq!(junk_item.display_name, "foo.tmp");
        assert_eq!(junk_item.size_bytes, 1024);
        assert!(junk_item.safe);
        assert_eq!(junk_item.age_days, Some(60));
        assert_eq!(junk_item.age_display.as_deref(), Some("2 meses"));
        assert_eq!(junk_item.source_type.as_deref(), Some("temp_user"));
    }

    #[test]
    fn test_junk_category_total_and_safe() {
        let items = vec![
            JunkItem {
                id: "1".to_string(),
                display_name: "a.tmp".to_string(),
                path: "C:\\a.tmp".to_string(),
                size_bytes: 1000,
                safe: true,
                age_days: None,
                age_display: None,
                source_type: None,
            },
            JunkItem {
                id: "2".to_string(),
                display_name: "b.tmp".to_string(),
                path: "C:\\b.tmp".to_string(),
                size_bytes: 500,
                safe: false,
                age_days: None,
                age_display: None,
                source_type: None,
            },
        ];

        let total: u64 = items.iter().map(|i| i.size_bytes).sum();
        let safe: u64 = items.iter().filter(|i| i.safe).map(|i| i.size_bytes).sum();

        let cat = JunkCategory {
            category_id: "temp_files".to_string(),
            display_name: "Archivos Temporales".to_string(),
            total_bytes: total,
            safe_bytes: safe,
            items,
            informational: None,
        };

        assert_eq!(cat.total_bytes, 1500);
        assert_eq!(cat.safe_bytes, 1000);
        assert_eq!(cat.informational, None);
    }

    #[test]
    fn test_prefetch_marked_informational() {
        let cat = JunkCategory {
            category_id: "prefetch".to_string(),
            display_name: "Prefetch".to_string(),
            total_bytes: 2048,
            safe_bytes: 0,
            items: vec![],
            informational: Some(true),
        };

        assert_eq!(cat.informational, Some(true));
        assert_eq!(cat.safe_bytes, 0);
    }

    #[tokio::test]
    async fn test_scan_emits_progress_and_returns_result() {
        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, mut rx) = mpsc::channel(64);

        let result = JunkFilesScanner::scan(&config, &cancel, &tx, None).await.unwrap();

        let cat_ids: Vec<&str> = result.categories.iter().map(|c| c.category_id.as_str()).collect();
        assert!(cat_ids.contains(&"temp_files"));
        assert!(cat_ids.contains(&"windows_leftovers"));
        assert!(cat_ids.contains(&"prefetch"));
        assert!(cat_ids.contains(&"download_installers"));
        assert!(cat_ids.contains(&"browser_caches"));
        assert!(cat_ids.contains(&"messaging_cache"));
        assert!(cat_ids.contains(&"app_residuals"));

        let prefetch_cat = result.categories.iter().find(|c| c.category_id == "prefetch").unwrap();
        assert_eq!(prefetch_cat.informational, Some(true));

        let expected_total: u64 = result.categories.iter().map(|c| c.total_bytes).sum();
        assert_eq!(result.total_junk_bytes, expected_total);

        let mut progress_count = 0;
        while rx.try_recv().is_ok() {
            progress_count += 1;
        }
        assert!(progress_count > 0);
    }
}
