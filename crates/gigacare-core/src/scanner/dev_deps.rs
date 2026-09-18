//! Módulo scanner de dependencias de desarrollo inactivas.
//!
//! Detecta:
//! - `node_modules` con `package.json` inactivo (> N días configurables)
//! - `.gradle/caches` con versiones no referenciadas
//! - `.nuget/packages`
//! - Docker: imágenes dangling, volúmenes huérfanos, build cache (vía CLI)

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::SystemTime;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use tokio::sync::mpsc;

use gigacare_config::AppConfig;

use crate::error::Result;
use crate::events::{ScanModule, ScanProgress};
use crate::models::{ItemCategory, ItemMetadata, ModuleScanResult, ModuleStatus, ScanFilters, ScanItem};
use crate::scanner::check_cancelled;

// ─────────────────────────── Constantes ───────────────────────────

/// Umbral de inactividad por defecto (días) si no está configurado.
const DEFAULT_INACTIVE_THRESHOLD_DAYS: u32 = 90;

/// Directorios conocidos de dependencias de desarrollo.
const NODE_MODULES_DIR: &str = "node_modules";
const GRADLE_CACHES_DIR: &str = ".gradle";
const NUGET_PACKAGES_DIR: &str = ".nuget";

// ─────────────────────────── Trait para ejecutar comandos ─────────

/// Trait para abstraer la ejecución de comandos del sistema (facilita testing).
pub trait CommandRunner: Send + Sync {
    /// Ejecuta un comando y retorna stdout como String.
    fn run_command(&self, program: &str, args: &[&str]) -> std::result::Result<String, std::io::Error>;
}

/// Implementación real que ejecuta comandos del sistema.
#[derive(Debug, Default)]
pub struct SystemCommandRunner;

impl CommandRunner for SystemCommandRunner {
    fn run_command(&self, program: &str, args: &[&str]) -> std::result::Result<String, std::io::Error> {
        let output = std::process::Command::new(program)
            .args(args)
            .output()?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                String::from_utf8_lossy(&output.stderr).to_string(),
            ))
        }
    }
}

// ─────────────────────────── DockerInfo ───────────────────────────

/// Información parseada de `docker system df --format json`.
#[derive(Debug, Clone, Default)]
pub struct DockerSystemInfo {
    /// Imágenes dangling: (id/name, tamaño bytes).
    pub dangling_images: Vec<(String, u64)>,
    /// Volúmenes huérfanos: (name, tamaño bytes).
    pub orphan_volumes: Vec<(String, u64)>,
    /// Build cache total en bytes.
    pub build_cache_bytes: u64,
}

// ─────────────────────────── DevDepsScanner ──────────────────────

/// Scanner de dependencias de desarrollo inactivas.
///
/// Busca directorios `node_modules`, `.gradle/caches`, `.nuget/packages`
/// y datos de Docker para identificar espacio recuperable.
pub struct DevDepsScanner {
    /// Directorios raíz donde buscar proyectos de desarrollo.
    search_roots: Vec<PathBuf>,
    /// Ejecutor de comandos (inyectable para tests).
    command_runner: Box<dyn CommandRunner>,
}

impl DevDepsScanner {
    /// Crea un nuevo DevDepsScanner con las raíces de búsqueda dadas.
    pub fn new(search_roots: Vec<PathBuf>) -> Self {
        Self {
            search_roots,
            command_runner: Box::new(SystemCommandRunner),
        }
    }

    /// Crea un DevDepsScanner con un CommandRunner personalizado (para tests).
    pub fn with_command_runner(search_roots: Vec<PathBuf>, runner: Box<dyn CommandRunner>) -> Self {
        Self {
            search_roots,
            command_runner: runner,
        }
    }

    /// Obtiene el umbral de inactividad en días desde la configuración.
    fn get_threshold_days(config: &AppConfig) -> u32 {
        let days = config.scanning.dev_inactive_threshold_days;
        if days > 0 { days } else { DEFAULT_INACTIVE_THRESHOLD_DAYS }
    }

    /// Calcula los días de antigüedad de un archivo/directorio basándose en su fecha de modificación.
    fn days_since_modified(path: &Path) -> Option<u64> {
        let metadata = std::fs::metadata(path).ok()?;
        let modified = metadata.modified().ok()?;
        let elapsed = SystemTime::now().duration_since(modified).ok()?;
        Some(elapsed.as_secs() / 86400)
    }

    /// Calcula el tamaño total de un directorio recursivamente.
    fn dir_size(path: &Path) -> u64 {
        if !path.is_dir() {
            return path.metadata().map(|m| m.len()).unwrap_or(0);
        }
        walkdir::WalkDir::new(path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
            .sum()
    }

    /// Busca directorios `node_modules` inactivos en las raíces de búsqueda.
    ///
    /// Un `node_modules` se considera inactivo si el `package.json` del
    /// proyecto padre no ha sido modificado en más de `threshold_days` días.
    fn scan_node_modules(
        &self,
        threshold_days: u32,
        cancel: &AtomicBool,
    ) -> Result<Vec<ScanItem>> {
        let mut items = Vec::new();

        for root in &self.search_roots {
            check_cancelled(cancel)?;

            if !root.exists() {
                continue;
            }

            // Buscar node_modules en subdirectorios (profundidad limitada)
            for entry in walkdir::WalkDir::new(root)
                .max_depth(5)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                check_cancelled(cancel)?;

                if !entry.file_type().is_dir() {
                    continue;
                }

                let dir_name = entry.file_name().to_string_lossy();
                if dir_name != NODE_MODULES_DIR {
                    continue;
                }

                let node_modules_path = entry.path().to_path_buf();
                let parent_dir = match node_modules_path.parent() {
                    Some(p) => p,
                    None => continue,
                };

                // Buscar package.json en el directorio padre
                let package_json = parent_dir.join("package.json");
                if !package_json.exists() {
                    continue;
                }

                // Verificar inactividad basándose en la fecha de modificación del package.json
                let days_inactive = match Self::days_since_modified(&package_json) {
                    Some(days) => days,
                    None => continue,
                };

                if days_inactive < threshold_days as u64 {
                    continue;
                }

                // Calcular tamaño del directorio node_modules
                let size_bytes = Self::dir_size(&node_modules_path);

                // Inferir nombre del proyecto del directorio padre
                let project_name = parent_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                let modified_at = std::fs::metadata(&package_json)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| DateTime::<Utc>::from(t))
                    .unwrap_or_else(Utc::now);

                items.push(ScanItem {
                    path: node_modules_path.to_string_lossy().to_string(),
                    size_bytes,
                    modified_at,
                    category: ItemCategory::Dependency,
                    metadata: ItemMetadata {
                        app_source: Some("node".to_string()),
                        project_name: Some(project_name),
                        days_inactive: Some(days_inactive),
                        extra: HashMap::new(),
                    },
                });
            }
        }

        Ok(items)
    }

    /// Busca caches de Gradle en `~/.gradle/caches` o directorios `.gradle`.
    fn scan_gradle_caches(
        &self,
        cancel: &AtomicBool,
    ) -> Result<Vec<ScanItem>> {
        let mut items = Vec::new();

        for root in &self.search_roots {
            check_cancelled(cancel)?;

            if !root.exists() {
                continue;
            }

            // Buscar directorios .gradle en las raíces
            for entry in walkdir::WalkDir::new(root)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                check_cancelled(cancel)?;

                if !entry.file_type().is_dir() {
                    continue;
                }

                let dir_name = entry.file_name().to_string_lossy();
                if dir_name != GRADLE_CACHES_DIR {
                    continue;
                }

                let gradle_dir = entry.path().to_path_buf();
                let caches_dir = gradle_dir.join("caches");

                if !caches_dir.exists() || !caches_dir.is_dir() {
                    continue;
                }

                // Escanear versiones de cache
                let cache_entries = match std::fs::read_dir(&caches_dir) {
                    Ok(entries) => entries,
                    Err(_) => continue,
                };

                for cache_entry in cache_entries.filter_map(|e| e.ok()) {
                    let cache_path = cache_entry.path();
                    if !cache_path.is_dir() {
                        continue;
                    }

                    let size_bytes = Self::dir_size(&cache_path);
                    let days_inactive = Self::days_since_modified(&cache_path).unwrap_or(0);

                    let version_name = cache_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());

                    let modified_at = std::fs::metadata(&cache_path)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .map(|t| DateTime::<Utc>::from(t))
                        .unwrap_or_else(Utc::now);

                    let project_name = gradle_dir
                        .parent()
                        .and_then(|p| p.file_name())
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());

                    items.push(ScanItem {
                        path: cache_path.to_string_lossy().to_string(),
                        size_bytes,
                        modified_at,
                        category: ItemCategory::Cache,
                        metadata: ItemMetadata {
                            app_source: Some("gradle".to_string()),
                            project_name: Some(format!("{} (cache {})", project_name, version_name)),
                            days_inactive: Some(days_inactive),
                            extra: HashMap::new(),
                        },
                    });
                }
            }
        }

        Ok(items)
    }

    /// Busca paquetes NuGet en `~/.nuget/packages` o directorios `.nuget`.
    fn scan_nuget_packages(
        &self,
        cancel: &AtomicBool,
    ) -> Result<Vec<ScanItem>> {
        let mut items = Vec::new();

        for root in &self.search_roots {
            check_cancelled(cancel)?;

            if !root.exists() {
                continue;
            }

            for entry in walkdir::WalkDir::new(root)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                check_cancelled(cancel)?;

                if !entry.file_type().is_dir() {
                    continue;
                }

                let dir_name = entry.file_name().to_string_lossy();
                if dir_name != NUGET_PACKAGES_DIR {
                    continue;
                }

                let nuget_dir = entry.path().to_path_buf();
                let packages_dir = nuget_dir.join("packages");

                if !packages_dir.exists() || !packages_dir.is_dir() {
                    continue;
                }

                let size_bytes = Self::dir_size(&packages_dir);
                let days_inactive = Self::days_since_modified(&packages_dir).unwrap_or(0);

                let modified_at = std::fs::metadata(&packages_dir)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| DateTime::<Utc>::from(t))
                    .unwrap_or_else(Utc::now);

                items.push(ScanItem {
                    path: packages_dir.to_string_lossy().to_string(),
                    size_bytes,
                    modified_at,
                    category: ItemCategory::Dependency,
                    metadata: ItemMetadata {
                        app_source: Some("nuget".to_string()),
                        project_name: None,
                        days_inactive: Some(days_inactive),
                        extra: HashMap::new(),
                    },
                });
            }
        }

        Ok(items)
    }

    /// Consulta Docker para obtener información de espacio usado.
    ///
    /// Ejecuta `docker system df --format json` y parsea el resultado.
    fn scan_docker(&self) -> Vec<ScanItem> {
        let output = match self.command_runner.run_command(
            "docker",
            &["system", "df", "--format", "{{json .}}"],
        ) {
            Ok(out) => out,
            Err(_) => return Vec::new(), // Docker no disponible
        };

        Self::parse_docker_output(&output)
    }

    /// Parsea la salida JSON de `docker system df`.
    ///
    /// La salida contiene líneas JSON, una por tipo (Images, Containers, Local Volumes, Build Cache).
    /// Formato esperado por línea:
    /// `{"Type":"Images","TotalCount":"5","Active":"2","Size":"1.2GB","Reclaimable":"800MB (66%)"}`
    fn parse_docker_output(output: &str) -> Vec<ScanItem> {
        let mut items = Vec::new();
        let now = Utc::now();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parsed: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let dtype = parsed["Type"].as_str().unwrap_or("");
            let reclaimable_str = parsed["Reclaimable"].as_str().unwrap_or("0B");
            let reclaimable_bytes = Self::parse_docker_size(reclaimable_str);

            if reclaimable_bytes == 0 {
                continue;
            }

            let (app_source, path_label) = match dtype {
                "Images" => ("docker-images", "docker://images/dangling"),
                "Local Volumes" => ("docker-volumes", "docker://volumes/orphan"),
                "Build Cache" => ("docker-buildcache", "docker://buildcache"),
                _ => continue,
            };

            items.push(ScanItem {
                path: path_label.to_string(),
                size_bytes: reclaimable_bytes,
                modified_at: now,
                category: ItemCategory::Cache,
                metadata: ItemMetadata {
                    app_source: Some(app_source.to_string()),
                    project_name: None,
                    days_inactive: None,
                    extra: HashMap::new(),
                },
            });
        }

        items
    }

    /// Parsea un string de tamaño de Docker (e.g. "1.2GB", "800MB", "500kB", "0B")
    /// a bytes.
    fn parse_docker_size(size_str: &str) -> u64 {
        // El formato puede ser "800MB (66%)" - tomar solo la parte de tamaño
        let size_part = size_str.split('(').next().unwrap_or(size_str).trim();

        if size_part == "0B" || size_part.is_empty() {
            return 0;
        }

        // Extraer número y unidad
        let mut num_end = 0;
        for (i, c) in size_part.char_indices() {
            if c.is_ascii_digit() || c == '.' {
                num_end = i + c.len_utf8();
            } else {
                break;
            }
        }

        let number: f64 = match size_part[..num_end].parse() {
            Ok(n) => n,
            Err(_) => return 0,
        };

        let unit = &size_part[num_end..];
        let multiplier: f64 = match unit {
            "B" => 1.0,
            "kB" | "KB" => 1_000.0,
            "MB" => 1_000_000.0,
            "GB" => 1_000_000_000.0,
            "TB" => 1_000_000_000_000.0,
            _ => 1.0,
        };

        (number * multiplier) as u64
    }
}

// ─────────────────────────── ScannerModule impl ──────────────────

#[async_trait]
impl super::ScannerModule for DevDepsScanner {
    fn module_id(&self) -> ScanModule {
        ScanModule::DevDependencies
    }

    async fn scan(
        &self,
        config: &AppConfig,
        cancel: &AtomicBool,
        tx: &mpsc::Sender<ScanProgress>,
        _filters: Option<&ScanFilters>,
    ) -> Result<ModuleScanResult> {
        let start = std::time::Instant::now();
        let threshold_days = Self::get_threshold_days(config);

        // Emitir progreso inicial
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 0,
                items_found: 0,
                bytes_found: 0,
                percent: 0.0,
                eta_seconds: None,
            })
            .await;

        // Paso 1: node_modules (40% del progreso)
        check_cancelled(cancel)?;
        let node_items = self.scan_node_modules(threshold_days, cancel)?;

        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 1,
                items_found: node_items.len() as u64,
                bytes_found: node_items.iter().map(|i| i.size_bytes).sum(),
                percent: 25.0,
                eta_seconds: None,
            })
            .await;

        // Paso 2: Gradle caches (25% del progreso)
        check_cancelled(cancel)?;
        let gradle_items = self.scan_gradle_caches(cancel)?;

        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 2,
                items_found: (node_items.len() + gradle_items.len()) as u64,
                bytes_found: node_items.iter().chain(gradle_items.iter()).map(|i| i.size_bytes).sum(),
                percent: 50.0,
                eta_seconds: None,
            })
            .await;

        // Paso 3: NuGet packages (25% del progreso)
        check_cancelled(cancel)?;
        let nuget_items = self.scan_nuget_packages(cancel)?;

        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 3,
                items_found: (node_items.len() + gradle_items.len() + nuget_items.len()) as u64,
                bytes_found: node_items.iter().chain(gradle_items.iter()).chain(nuget_items.iter()).map(|i| i.size_bytes).sum(),
                percent: 75.0,
                eta_seconds: None,
            })
            .await;

        // Paso 4: Docker (10% del progreso)
        check_cancelled(cancel)?;
        let docker_items = self.scan_docker();

        // Consolidar resultados
        let mut all_items = Vec::new();
        all_items.extend(node_items);
        all_items.extend(gradle_items);
        all_items.extend(nuget_items);
        all_items.extend(docker_items);

        let total_size: u64 = all_items.iter().map(|i| i.size_bytes).sum();
        let items_count = all_items.len() as u64;

        // Emitir progreso final
        let _ = tx
            .send(ScanProgress {
                module: ScanModule::DevDependencies,
                items_scanned: 4,
                items_found: items_count,
                bytes_found: total_size,
                percent: 100.0,
                eta_seconds: Some(0),
            })
            .await;

        let duration = start.elapsed();
        Ok(ModuleScanResult {
            module_id: ScanModule::DevDependencies.as_str().to_string(),
            status: ModuleStatus::Completed,
            duration_ms: duration.as_millis() as u64,
            items_found: items_count,
            total_size_bytes: total_size,
            items: all_items,
        })
    }
}

// ─────────────────────────── Tests ───────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::ScannerModule;
    use std::fs;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;
    use tokio::sync::mpsc;

    /// Helper: crea una estructura de proyecto Node.js con node_modules.
    fn create_node_project(root: &Path, name: &str, days_old: u64) {
        let project_dir = root.join(name);
        fs::create_dir_all(&project_dir).unwrap();

        // Crear package.json
        let package_json = project_dir.join("package.json");
        fs::write(
            &package_json,
            r#"{"name": "test-project", "version": "1.0.0"}"#,
        )
        .unwrap();

        // Crear node_modules con contenido
        let nm_dir = project_dir.join("node_modules");
        fs::create_dir_all(nm_dir.join("some-package")).unwrap();
        fs::write(nm_dir.join("some-package").join("index.js"), "module.exports = {};").unwrap();
        fs::write(nm_dir.join(".package-lock.json"), "{}").unwrap();

        // Ajustar la fecha de modificación del package.json
        if days_old > 0 {
            let past = SystemTime::now()
                - std::time::Duration::from_secs(days_old * 86400);
            filetime::set_file_mtime(
                &package_json,
                filetime::FileTime::from_system_time(past),
            )
            .unwrap();
        }
    }

    /// Helper: crea una estructura .gradle/caches simulada.
    fn create_gradle_caches(root: &Path) {
        let gradle_dir = root.join(".gradle").join("caches");
        let v7 = gradle_dir.join("7.0");
        let v8 = gradle_dir.join("8.0");
        fs::create_dir_all(&v7).unwrap();
        fs::create_dir_all(&v8).unwrap();
        fs::write(v7.join("cache-data.bin"), "cached-data-v7").unwrap();
        fs::write(v8.join("cache-data.bin"), "cached-data-v8-longer").unwrap();
    }

    /// Helper: crea estructura .nuget/packages simulada.
    fn create_nuget_packages(root: &Path) {
        let packages_dir = root.join(".nuget").join("packages");
        let pkg = packages_dir.join("Newtonsoft.Json").join("13.0.1");
        fs::create_dir_all(&pkg).unwrap();
        fs::write(pkg.join("newtonsoft.json.nupkg"), "fake-nupkg-content").unwrap();
    }

    /// Mock CommandRunner que retorna una salida predefinida.
    struct MockCommandRunner {
        output: String,
        should_fail: bool,
    }

    impl MockCommandRunner {
        fn with_output(output: &str) -> Self {
            Self {
                output: output.to_string(),
                should_fail: false,
            }
        }

        fn failing() -> Self {
            Self {
                output: String::new(),
                should_fail: true,
            }
        }
    }

    impl CommandRunner for MockCommandRunner {
        fn run_command(&self, _program: &str, _args: &[&str]) -> std::result::Result<String, std::io::Error> {
            if self.should_fail {
                Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "docker not found",
                ))
            } else {
                Ok(self.output.clone())
            }
        }
    }

    // ─────────────── Tests de node_modules inactivos ──────────────

    #[tokio::test]
    async fn test_detecta_node_modules_inactivos() {
        let tmp = TempDir::new().unwrap();
        // Proyecto con package.json de 120 días (> 90 default)
        create_node_project(tmp.path(), "old-project", 120);

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, mut rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.module_id, "dev_dependencies");
        assert_eq!(result.status, ModuleStatus::Completed);
        assert!(result.items_found >= 1, "Debería encontrar al menos 1 node_modules inactivo");

        // Verificar que el item encontrado es de tipo Dependency
        let node_item = result
            .items
            .iter()
            .find(|i| i.metadata.app_source.as_deref() == Some("node"))
            .expect("Debería encontrar un item de node");

        assert_eq!(node_item.category, ItemCategory::Dependency);
        assert!(node_item.size_bytes > 0, "El tamaño debería ser > 0");
        assert!(
            node_item.metadata.days_inactive.unwrap() >= 120,
            "Debería tener al menos 120 días de inactividad"
        );
        assert_eq!(
            node_item.metadata.project_name.as_deref(),
            Some("old-project")
        );

        // Verificar eventos de progreso
        drop(tx);
        let mut events = Vec::new();
        while let Some(evt) = rx.recv().await {
            events.push(evt);
        }
        assert!(events.len() >= 2, "Debería emitir al menos 2 eventos de progreso");
        assert_eq!(events.first().unwrap().percent, 0.0);
        assert_eq!(events.last().unwrap().percent, 100.0);
    }

    #[tokio::test]
    async fn test_respeta_umbral_de_dias() {
        let tmp = TempDir::new().unwrap();
        // Proyecto con 30 días de inactividad (< 90 default)
        create_node_project(tmp.path(), "recent-project", 30);

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default(); // threshold = 90 días
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        // No debería encontrar nada porque 30 < 90
        let node_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("node"))
            .collect();
        assert!(
            node_items.is_empty(),
            "No debería detectar node_modules con solo 30 días (umbral=90)"
        );
    }

    #[tokio::test]
    async fn test_umbral_personalizado_detecta_inactivos() {
        let tmp = TempDir::new().unwrap();
        // Proyecto con 30 días de inactividad
        create_node_project(tmp.path(), "medium-project", 30);

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        // Configurar umbral bajo (15 días)
        let mut config = AppConfig::default();
        config.scanning.dev_inactive_threshold_days = 15;

        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        // Ahora sí debería encontrarlo (30 > 15)
        let node_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("node"))
            .collect();
        assert!(
            !node_items.is_empty(),
            "Debería detectar node_modules con 30 días cuando umbral=15"
        );
    }

    #[tokio::test]
    async fn test_node_modules_reciente_no_detectado() {
        let tmp = TempDir::new().unwrap();
        // Proyecto con package.json recién creado (0 días)
        create_node_project(tmp.path(), "fresh-project", 0);

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        let node_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("node"))
            .collect();
        assert!(
            node_items.is_empty(),
            "No debería detectar proyectos recientes (0 días < 90)"
        );
    }

    // ─────────────── Tests de Gradle caches ──────────────────────

    #[tokio::test]
    async fn test_detecta_gradle_caches() {
        let tmp = TempDir::new().unwrap();
        create_gradle_caches(tmp.path());

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        let gradle_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("gradle"))
            .collect();

        assert!(
            gradle_items.len() >= 2,
            "Debería encontrar al menos 2 versiones de cache de Gradle"
        );

        for item in &gradle_items {
            assert_eq!(item.category, ItemCategory::Cache);
            assert!(item.size_bytes > 0);
        }
    }

    // ─────────────── Tests de NuGet packages ─────────────────────

    #[tokio::test]
    async fn test_detecta_nuget_packages() {
        let tmp = TempDir::new().unwrap();
        create_nuget_packages(tmp.path());

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        let nuget_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| i.metadata.app_source.as_deref() == Some("nuget"))
            .collect();

        assert!(
            !nuget_items.is_empty(),
            "Debería encontrar paquetes NuGet"
        );
        assert_eq!(nuget_items[0].category, ItemCategory::Dependency);
        assert!(nuget_items[0].size_bytes > 0);
    }

    // ─────────────── Tests de Docker CLI mock ────────────────────

    #[tokio::test]
    async fn test_docker_cli_mock_parsea_correctamente() {
        let docker_output = r#"{"Type":"Images","TotalCount":"5","Active":"2","Size":"1.2GB","Reclaimable":"800MB (66%)"}
{"Type":"Containers","TotalCount":"3","Active":"1","Size":"500MB","Reclaimable":"200MB (40%)"}
{"Type":"Local Volumes","TotalCount":"10","Active":"3","Size":"2GB","Reclaimable":"1.5GB (75%)"}
{"Type":"Build Cache","TotalCount":"20","Active":"5","Size":"3GB","Reclaimable":"2GB (66%)"}"#;

        let tmp = TempDir::new().unwrap();
        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::with_output(docker_output)),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        // Debería encontrar 3 items de Docker (Images, Volumes, Build Cache — no Containers)
        let docker_items: Vec<_> = result
            .items
            .iter()
            .filter(|i| {
                i.metadata
                    .app_source
                    .as_deref()
                    .map_or(false, |s| s.starts_with("docker"))
            })
            .collect();

        assert_eq!(
            docker_items.len(),
            3,
            "Debería encontrar 3 items Docker (images, volumes, build cache)"
        );

        // Verificar imágenes dangling
        let images = docker_items
            .iter()
            .find(|i| i.metadata.app_source.as_deref() == Some("docker-images"))
            .expect("Debería encontrar docker images");
        assert_eq!(images.size_bytes, 800_000_000); // 800MB

        // Verificar volúmenes
        let volumes = docker_items
            .iter()
            .find(|i| i.metadata.app_source.as_deref() == Some("docker-volumes"))
            .expect("Debería encontrar docker volumes");
        assert_eq!(volumes.size_bytes, 1_500_000_000); // 1.5GB

        // Verificar build cache
        let build_cache = docker_items
            .iter()
            .find(|i| i.metadata.app_source.as_deref() == Some("docker-buildcache"))
            .expect("Debería encontrar docker build cache");
        assert_eq!(build_cache.size_bytes, 2_000_000_000); // 2GB
    }

    #[tokio::test]
    async fn test_docker_no_disponible_no_falla() {
        let tmp = TempDir::new().unwrap();
        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        // No debería fallar aunque Docker no esté disponible
        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();
        assert_eq!(result.status, ModuleStatus::Completed);
    }

    // ─────────────── Tests de parseo de tamaños Docker ───────────

    #[test]
    fn test_parse_docker_size_mb() {
        assert_eq!(DevDepsScanner::parse_docker_size("800MB (66%)"), 800_000_000);
    }

    #[test]
    fn test_parse_docker_size_gb() {
        assert_eq!(DevDepsScanner::parse_docker_size("1.5GB (75%)"), 1_500_000_000);
    }

    #[test]
    fn test_parse_docker_size_kb() {
        assert_eq!(DevDepsScanner::parse_docker_size("500kB"), 500_000);
    }

    #[test]
    fn test_parse_docker_size_zero() {
        assert_eq!(DevDepsScanner::parse_docker_size("0B"), 0);
    }

    #[test]
    fn test_parse_docker_size_bytes() {
        assert_eq!(DevDepsScanner::parse_docker_size("1024B"), 1024);
    }

    #[test]
    fn test_parse_docker_size_empty() {
        assert_eq!(DevDepsScanner::parse_docker_size(""), 0);
    }

    // ─────────────── Tests de cancelación ────────────────────────

    #[tokio::test]
    async fn test_cancelacion_durante_escaneo() {
        let tmp = TempDir::new().unwrap();
        create_node_project(tmp.path(), "project1", 120);

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(true); // Cancelar inmediatamente
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await;
        assert!(result.is_err(), "Debería retornar error por cancelación");
    }

    // ─────────────── Test de escaneo combinado ───────────────────

    #[tokio::test]
    async fn test_escaneo_combinado_multiples_fuentes() {
        let tmp = TempDir::new().unwrap();
        create_node_project(tmp.path(), "old-node-app", 120);
        create_gradle_caches(tmp.path());
        create_nuget_packages(tmp.path());

        let docker_output = r#"{"Type":"Build Cache","TotalCount":"10","Active":"2","Size":"1GB","Reclaimable":"500MB (50%)"}"#;

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::with_output(docker_output)),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.status, ModuleStatus::Completed);
        assert!(result.items_found >= 4, "Debería encontrar items de múltiples fuentes");
        assert!(result.total_size_bytes > 0, "El tamaño total debería ser > 0");

        // Verificar que hay items de cada fuente
        let sources: Vec<_> = result
            .items
            .iter()
            .filter_map(|i| i.metadata.app_source.as_deref())
            .collect();

        assert!(sources.contains(&"node"), "Debería incluir items de node");
        assert!(sources.contains(&"gradle"), "Debería incluir items de gradle");
        assert!(sources.contains(&"nuget"), "Debería incluir items de nuget");
        assert!(sources.contains(&"docker-buildcache"), "Debería incluir items de docker");
    }

    // ─────────────── Test de directorio vacío ────────────────────

    #[tokio::test]
    async fn test_directorio_vacio_no_falla() {
        let tmp = TempDir::new().unwrap();

        let scanner = DevDepsScanner::with_command_runner(
            vec![tmp.path().to_path_buf()],
            Box::new(MockCommandRunner::failing()),
        );

        let config = AppConfig::default();
        let cancel = AtomicBool::new(false);
        let (tx, _rx) = mpsc::channel(32);

        let result = scanner.scan(&config, &cancel, &tx, None).await.unwrap();

        assert_eq!(result.status, ModuleStatus::Completed);
        assert_eq!(result.items_found, 0);
        assert_eq!(result.total_size_bytes, 0);
    }

    // ─────────────── Test de parse_docker_output ─────────────────

    #[test]
    fn test_parse_docker_output_lineas_invalidas() {
        let output = "not valid json
{invalid}
";
        let items = DevDepsScanner::parse_docker_output(output);
        assert!(items.is_empty(), "Líneas JSON inválidas no deberían generar items");
    }

    #[test]
    fn test_parse_docker_output_sin_reclaimable() {
        let output = r#"{"Type":"Images","TotalCount":"0","Active":"0","Size":"0B","Reclaimable":"0B"}"#;
        let items = DevDepsScanner::parse_docker_output(output);
        assert!(items.is_empty(), "Items sin espacio reclamable no deberían incluirse");
    }
}
