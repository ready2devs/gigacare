//! Errores para el subsistema de visión y procesamiento de imágenes.

use thiserror::Error;

/// Errores posibles durante el análisis visual y generación de miniaturas.
#[derive(Debug, Error)]
pub enum VisionError {
    /// Error de entrada/salida al leer o escribir archivos de imagen.
    #[error("Error de E/S en visión: {0}")]
    Io(#[from] std::io::Error),

    /// Error de decodificación o procesamiento de la librería `image`.
    #[error("Error al procesar imagen: {0}")]
    Image(#[from] image::ImageError),

    /// Imagen con dimensiones insuficientes para aplicar el kernel (mínimo 3x3).
    #[error("Dimensiones de imagen insuficientes: {width}x{height} (mínimo requerido 3x3)")]
    ImageTooSmall { width: u32, height: u32 },

    /// Fallo al generar miniatura dentro del límite de peso máximo tras reducción de calidad.
    #[error("No se pudo comprimir la miniatura por debajo de {limit_bytes} B (tamaño final: {size_bytes} B)")]
    ThumbnailCompressionFailed {
        size_bytes: usize,
        limit_bytes: usize,
    },
}

/// Alias Result para operaciones de visión.
pub type Result<T> = std::result::Result<T, VisionError>;
