//! Modelos de datos para el sistema de cuarentena según spec.md (QuarantineManifest v1).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Estado actual de un archivo registrado en cuarentena.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuarantineStatus {
    /// Archivo actualmente almacenado en la carpeta de cuarentena.
    Quarantined,
    /// Archivo que ha sido restaurado a su ubicación original.
    Restored,
    /// Archivo que ha sido eliminado permanentemente por purga o acción manual.
    Purged,
}

impl std::fmt::Display for QuarantineStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QuarantineStatus::Quarantined => write!(f, "quarantined"),
            QuarantineStatus::Restored => write!(f, "restored"),
            QuarantineStatus::Purged => write!(f, "purged"),
        }
    }
}

/// Registro individual de un archivo en cuarentena.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuarantineEntry {
    /// Identificador único UUID v4 de la entrada.
    pub id: String,
    /// Ruta original absoluta donde se encontraba el archivo antes de ser movido.
    pub original_path: String,
    /// Ruta física donde reside el archivo dentro del directorio de cuarentena.
    pub quarantine_path: String,
    /// Hash criptográfico SHA-256 del contenido original del archivo.
    pub sha256: String,
    /// Tamaño del archivo en bytes.
    pub size_bytes: u64,
    /// Timestamp ISO-8601 en el que el archivo ingresó a cuarentena.
    pub quarantined_at: DateTime<Utc>,
    /// Timestamp ISO-8601 en el que expira el periodo de retención.
    pub expires_at: DateTime<Utc>,
    /// Módulo o scanner que originó el movimiento a cuarentena.
    pub source_module: String,
    /// Estado del elemento en el ciclo de vida de cuarentena.
    pub status: QuarantineStatus,
}

/// Manifiesto JSON de la cuarentena (QuarantineManifest v1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuarantineManifest {
    /// Versión del esquema del manifiesto (siempre 1 en v1).
    pub version: u32,
    /// Lista de entradas registradas en la cuarentena.
    pub entries: Vec<QuarantineEntry>,
}

impl Default for QuarantineManifest {
    fn default() -> Self {
        Self {
            version: 1,
            entries: Vec::new(),
        }
    }
}

/// Filtros para consulta o listado de elementos en cuarentena.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuarantineFilters {
    /// Filtrar por módulo de origen exacto (ej. "messaging_cache", "system_cleaner").
    pub source_module: Option<String>,
    /// Búsqueda por subcadena en la ruta original o nombre de archivo.
    pub search_query: Option<String>,
    /// Filtrar por estado específico (si es None, lista sólo Quarantined por defecto o según use-case).
    pub status: Option<QuarantineStatus>,
}

/// Estadísticas agregadas del estado actual de la cuarentena.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuarantineStats {
    /// Cantidad total de archivos actualmente en cuarentena activa (Quarantined).
    pub total_items: u64,
    /// Bytes totales ocupados por los archivos actualmente en cuarentena activa.
    pub total_bytes: u64,
    /// Límite máximo de bytes configurado para la cuarentena.
    pub max_space_bytes: u64,
    /// Timestamp de la entrada activa más antigua.
    pub oldest_quarantined_at: Option<DateTime<Utc>>,
}
