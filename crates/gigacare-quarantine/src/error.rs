//! Tipos de error para el módulo de cuarentena.

use std::path::PathBuf;
use thiserror::Error;

use crate::models::QuarantineStatus;

/// Errores posibles en operaciones de cuarentena.
#[derive(Debug, Error)]
pub enum QuarantineError {
    /// Error de entrada/salida del sistema de archivos.
    #[error("Error de E/S en cuarentena: {0}")]
    Io(#[from] std::io::Error),

    /// Error de serialización/deserialización JSON.
    #[error("Error en formato JSON de manifiesto: {0}")]
    Json(#[from] serde_json::Error),

    /// Error al calcular hash de archivo.
    #[error("Error al calcular hash: {0}")]
    Hash(#[from] gigacare_hash::HashError),

    /// Entrada de cuarentena no encontrada.
    #[error("Entrada de cuarentena no encontrada: id={0}")]
    NotFound(String),

    /// Archivo no encontrado en disco.
    #[error("Archivo no encontrado: {0}")]
    FileNotFound(PathBuf),

    /// El archivo de destino ya existe en la ubicación de restauración.
    #[error("El archivo de destino ya existe: {0}")]
    TargetAlreadyExists(PathBuf),

    /// Fallo de integridad de hash SHA-256 al restaurar archivo.
    #[error("Fallo de integridad para {id}: esperado {expected}, actual {actual}")]
    IntegrityMismatch {
        id: String,
        expected: String,
        actual: String,
    },

    /// Se superó el límite de espacio asignado para la cuarentena.
    #[error("Límite de espacio de cuarentena excedido: actual={current_bytes} B, nuevo={required_bytes} B, límite={limit_bytes} B")]
    SpaceLimitExceeded {
        current_bytes: u64,
        required_bytes: u64,
        limit_bytes: u64,
    },

    /// Estado inválido para realizar la operación solicitada.
    #[error("Estado inválido para {id}: estado actual {status:?}")]
    InvalidState {
        id: String,
        status: QuarantineStatus,
    },

    /// Días de retención fuera del rango permitido (1..=90).
    #[error("Días de retención inválidos: {0} (debe estar entre 1 y 90)")]
    InvalidRetentionDays(u32),
}

/// Alias Result para operaciones de cuarentena.
pub type Result<T> = std::result::Result<T, QuarantineError>;
