//! Modelos de datos del core de GigaCare.
//!
//! Define las estructuras principales de resultados de escaneo, items,
//! categorías y filtros según la especificación del proyecto.

use crate::events::ScanModule;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─────────────────────────── Plataforma ───────────────────────────

/// Plataforma donde se ejecuta el escaneo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Windows,
    Android,
}

impl Default for Platform {
    fn default() -> Self {
        Platform::Windows
    }
}

// ─────────────────────────── ItemCategory ─────────────────────────

/// Categoría de un item encontrado durante el escaneo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemCategory {
    Image,
    Video,
    Audio,
    Document,
    Cache,
    Dependency,
    Installer,
    Temp,
}

impl std::fmt::Display for ItemCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            ItemCategory::Image => "image",
            ItemCategory::Video => "video",
            ItemCategory::Audio => "audio",
            ItemCategory::Document => "document",
            ItemCategory::Cache => "cache",
            ItemCategory::Dependency => "dependency",
            ItemCategory::Installer => "installer",
            ItemCategory::Temp => "temp",
        };
        write!(f, "{}", s)
    }
}

// ─────────────────────────── ModuleStatus ─────────────────────────

/// Estado de finalización de un módulo de escaneo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModuleStatus {
    Completed,
    Error,
    Skipped,
    Cancelled,
}

impl Default for ModuleStatus {
    fn default() -> Self {
        ModuleStatus::Completed
    }
}

// ─────────────────────────── ItemMetadata ─────────────────────────

/// Metadatos adicionales de un item escaneado.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ItemMetadata {
    /// Aplicación de origen (whatsapp, telegram, node, gradle, docker, system).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_source: Option<String>,
    /// Nombre del proyecto (solo para dev_dependencies).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    /// Días de inactividad del item.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_inactive: Option<u64>,
    /// Campos adicionales para extensibilidad.
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

// ─────────────────────────── ScanItem ─────────────────────────────

/// Un item individual encontrado durante el escaneo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScanItem {
    /// Ruta completa al archivo o directorio.
    pub path: String,
    /// Tamaño en bytes.
    pub size_bytes: u64,
    /// Fecha de última modificación (ISO-8601).
    pub modified_at: DateTime<Utc>,
    /// Categoría del item.
    pub category: ItemCategory,
    /// Metadatos adicionales.
    pub metadata: ItemMetadata,
}

// ─────────────────────────── ModuleScanResult ─────────────────────

/// Resultado del escaneo de un módulo individual.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModuleScanResult {
    /// Identificador del módulo (como string para el JSON).
    pub module_id: String,
    /// Estado de finalización del módulo.
    pub status: ModuleStatus,
    /// Duración del escaneo en milisegundos.
    pub duration_ms: u64,
    /// Número de items encontrados.
    pub items_found: u64,
    /// Tamaño total en bytes de los items encontrados.
    pub total_size_bytes: u64,
    /// Lista de items encontrados.
    pub items: Vec<ScanItem>,
}

impl ModuleScanResult {
    /// Crea un resultado vacío para un módulo (stub).
    pub fn empty(module: &ScanModule, status: ModuleStatus, duration_ms: u64) -> Self {
        Self {
            module_id: module.as_str().to_string(),
            status,
            duration_ms,
            items_found: 0,
            total_size_bytes: 0,
            items: Vec::new(),
        }
    }
}

// ─────────────────────────── ScanResult ───────────────────────────

/// Resultado completo de un escaneo SmartCare.
///
/// Contiene los resultados de todos los módulos escaneados, el total
/// de bytes recuperables y el conteo total de items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScanResult {
    /// Identificador único del escaneo (UUID v4).
    pub id: String,
    /// Marca temporal del escaneo (ISO-8601).
    pub timestamp: DateTime<Utc>,
    /// Plataforma donde se ejecutó el escaneo.
    pub platform: Platform,
    /// Resultados por módulo.
    pub modules: Vec<ModuleScanResult>,
    /// Total de bytes recuperables en todos los módulos.
    pub total_recoverable_bytes: u64,
    /// Total de items encontrados en todos los módulos.
    pub total_items: u64,
}

impl ScanResult {
    /// Crea un nuevo ScanResult vacío con UUID e instante actuales.
    pub fn new(platform: Platform) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            platform,
            modules: Vec::new(),
            total_recoverable_bytes: 0,
            total_items: 0,
        }
    }

    /// Agrega el resultado de un módulo y actualiza los totales.
    pub fn add_module(&mut self, module_result: ModuleScanResult) {
        self.total_recoverable_bytes += module_result.total_size_bytes;
        self.total_items += module_result.items_found;
        self.modules.push(module_result);
    }
}

// ─────────────────────────── ScanFilters ──────────────────────────

/// Filtros opcionales para personalizar el escaneo de un módulo.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ScanFilters {
    /// Solo incluir items con al menos esta antigüedad en días.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_age_days: Option<u64>,
    /// Solo incluir items de hasta este tamaño en bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_size_bytes: Option<u64>,
    /// Solo incluir items de tamaño mínimo en bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_size_bytes: Option<u64>,
    /// Solo incluir items de estas categorías.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<ItemCategory>>,
    /// Rutas a excluir del escaneo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excluded_paths: Option<Vec<String>>,
}

// ─────────────────────────── CleanResult ──────────────────────────

/// Resultado de una operación de limpieza (movimiento a cuarentena).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CleanResult {
    /// ID del escaneo original que generó los items a limpiar.
    pub scan_id: String,
    /// Marca temporal de la limpieza.
    pub timestamp: DateTime<Utc>,
    /// Número de items movidos exitosamente a cuarentena.
    pub items_moved: u64,
    /// Número de items que fallaron al moverse.
    pub items_failed: u64,
    /// Bytes totales liberados.
    pub bytes_freed: u64,
    /// Errores individuales por archivo, si los hubo.
    pub errors: Vec<CleanError>,
}

/// Error individual al limpiar un archivo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CleanError {
    /// Ruta del archivo que falló.
    pub path: String,
    /// Descripción del error.
    pub reason: String,
}

// ─────────────────────────── PreviewResult ────────────────────────

/// Resultado de una vista previa de limpieza (sin ejecutar la limpieza).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreviewResult {
    /// Módulos incluidos en la vista previa.
    pub modules: Vec<String>,
    /// Total de items que serían limpiados.
    pub total_items: u64,
    /// Total de bytes que serían liberados.
    pub total_bytes: u64,
    /// Items agrupados por categoría con sus totales.
    pub by_category: HashMap<String, CategorySummary>,
}

/// Resumen de items por categoría.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategorySummary {
    /// Número de items en esta categoría.
    pub count: u64,
    /// Tamaño total en bytes.
    pub total_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_result_new() {
        let result = ScanResult::new(Platform::Windows);
        assert!(!result.id.is_empty());
        assert_eq!(result.platform, Platform::Windows);
        assert_eq!(result.modules.len(), 0);
        assert_eq!(result.total_recoverable_bytes, 0);
        assert_eq!(result.total_items, 0);
    }

    #[test]
    fn test_scan_result_add_module() {
        let mut result = ScanResult::new(Platform::Windows);
        let module = ModuleScanResult {
            module_id: "system_temp".to_string(),
            status: ModuleStatus::Completed,
            duration_ms: 150,
            items_found: 5,
            total_size_bytes: 1024,
            items: vec![],
        };
        result.add_module(module);
        assert_eq!(result.modules.len(), 1);
        assert_eq!(result.total_recoverable_bytes, 1024);
        assert_eq!(result.total_items, 5);
    }

    #[test]
    fn test_scan_result_add_multiple_modules() {
        let mut result = ScanResult::new(Platform::Windows);
        result.add_module(ModuleScanResult::empty(
            &ScanModule::SystemTemp,
            ModuleStatus::Completed,
            100,
        ));
        result.add_module(ModuleScanResult {
            module_id: "messaging_cache".to_string(),
            status: ModuleStatus::Completed,
            duration_ms: 200,
            items_found: 10,
            total_size_bytes: 2048,
            items: vec![],
        });
        assert_eq!(result.modules.len(), 2);
        assert_eq!(result.total_items, 10);
        assert_eq!(result.total_recoverable_bytes, 2048);
    }

    #[test]
    fn test_module_scan_result_empty() {
        let module = ModuleScanResult::empty(
            &ScanModule::Installers,
            ModuleStatus::Completed,
            50,
        );
        assert_eq!(module.module_id, "installers");
        assert_eq!(module.status, ModuleStatus::Completed);
        assert_eq!(module.duration_ms, 50);
        assert_eq!(module.items_found, 0);
        assert_eq!(module.total_size_bytes, 0);
        assert!(module.items.is_empty());
    }

    #[test]
    fn test_scan_item_serialize() {
        let item = ScanItem {
            path: "C:\\Users\\Test\\temp.tmp".to_string(),
            size_bytes: 4096,
            modified_at: Utc::now(),
            category: ItemCategory::Temp,
            metadata: ItemMetadata {
                app_source: Some("system".to_string()),
                project_name: None,
                days_inactive: Some(30),
                extra: HashMap::new(),
            },
        };
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("temp"));
        assert!(json.contains("4096"));

        let deserialized: ScanItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.size_bytes, 4096);
        assert_eq!(deserialized.category, ItemCategory::Temp);
    }

    #[test]
    fn test_scan_result_serialize_roundtrip() {
        let mut result = ScanResult::new(Platform::Windows);
        result.add_module(ModuleScanResult::empty(
            &ScanModule::DevDependencies,
            ModuleStatus::Completed,
            100,
        ));
        let json = serde_json::to_string_pretty(&result).unwrap();
        let deserialized: ScanResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, result.id);
        assert_eq!(deserialized.modules.len(), 1);
        assert_eq!(deserialized.modules[0].module_id, "dev_dependencies");
    }

    #[test]
    fn test_item_category_display() {
        assert_eq!(format!("{}", ItemCategory::Cache), "cache");
        assert_eq!(format!("{}", ItemCategory::Dependency), "dependency");
        assert_eq!(format!("{}", ItemCategory::Image), "image");
    }

    #[test]
    fn test_scan_filters_default() {
        let filters = ScanFilters::default();
        assert!(filters.min_age_days.is_none());
        assert!(filters.max_size_bytes.is_none());
        assert!(filters.categories.is_none());
    }

    #[test]
    fn test_platform_serde() {
        let json = serde_json::to_string(&Platform::Windows).unwrap();
        assert_eq!(json, "\"windows\"");
        let p: Platform = serde_json::from_str(&json).unwrap();
        assert_eq!(p, Platform::Windows);
    }

    #[test]
    fn test_module_status_serde() {
        let json = serde_json::to_string(&ModuleStatus::Cancelled).unwrap();
        assert_eq!(json, "\"cancelled\"");
        let s: ModuleStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(s, ModuleStatus::Cancelled);
    }

    #[test]
    fn test_clean_result_structure() {
        let result = CleanResult {
            scan_id: "test-uuid".to_string(),
            timestamp: Utc::now(),
            items_moved: 10,
            items_failed: 2,
            bytes_freed: 8192,
            errors: vec![CleanError {
                path: "C:\\fail.tmp".to_string(),
                reason: "Permission denied".to_string(),
            }],
        };
        assert_eq!(result.items_moved, 10);
        assert_eq!(result.errors.len(), 1);
    }

    #[test]
    fn test_preview_result_structure() {
        let mut by_cat = HashMap::new();
        by_cat.insert(
            "cache".to_string(),
            CategorySummary {
                count: 5,
                total_bytes: 2048,
            },
        );
        let preview = PreviewResult {
            modules: vec!["system_temp".to_string()],
            total_items: 5,
            total_bytes: 2048,
            by_category: by_cat,
        };
        assert_eq!(preview.total_items, 5);
        assert!(preview.by_category.contains_key("cache"));
    }
}