//! Generación y compresión de miniaturas JPEG para GigaCare.
//!
//! Restricciones estrictas según spec.md (RF-503, LT-001, AC-009):
//! - Dimensión mayor <= 512px.
//! - Calidad JPEG inicial 60%.
//! - Peso máximo absoluto <= 100KB (102,400 bytes).
//! - Reducción iterativa de calidad si el tamaño inicial excede el límite.

use std::path::Path;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::DynamicImage;

use crate::error::{Result, VisionError};

/// Dimensión máxima en píxeles para el lado mayor de la miniatura (512px).
pub const MAX_THUMBNAIL_DIMENSION_PX: u32 = 512;

/// Calidad JPEG inicial por defecto según especificación (60%).
pub const DEFAULT_INITIAL_JPEG_QUALITY: u8 = 60;

/// Peso máximo permitido para una miniatura: 100 KB (102,400 bytes).
pub const MAX_THUMBNAIL_BYTES: usize = 100 * 1024;

/// Codifica una imagen en formato JPEG a un buffer en memoria con la calidad indicada.
fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let rgb = img.to_rgb8();
    let encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
    DynamicImage::ImageRgb8(rgb).write_with_encoder(encoder)?;
    Ok(buffer)
}

/// Genera el buffer de bytes JPEG para una miniatura cumpliendo todas las restricciones:
/// lado mayor <= 512px, calidad inicial 60%, peso <= 100KB.
///
/// Si el JPEG a calidad 60% excede los 100KB, reduce iterativamente la calidad
/// en pasos descendentes (50, 40, 30, 20, 10, 5) hasta satisfacer el límite.
pub fn generate_thumbnail_bytes(img: &DynamicImage) -> Result<Vec<u8>> {
    let width = img.width();
    let height = img.height();

    // 1. Redimensionar si el lado mayor excede 512px
    let resized = if width > MAX_THUMBNAIL_DIMENSION_PX || height > MAX_THUMBNAIL_DIMENSION_PX {
        img.resize(
            MAX_THUMBNAIL_DIMENSION_PX,
            MAX_THUMBNAIL_DIMENSION_PX,
            FilterType::Lanczos3,
        )
    } else {
        img.clone()
    };

    // 2. Compresión iterativa de calidad JPEG
    let quality_steps: &[u8] = &[DEFAULT_INITIAL_JPEG_QUALITY, 50, 40, 30, 20, 10, 5];

    let mut last_buffer = Vec::new();

    for &quality in quality_steps {
        let buf = encode_jpeg(&resized, quality)?;
        if buf.len() <= MAX_THUMBNAIL_BYTES {
            return Ok(buf);
        }
        last_buffer = buf;
    }

    // 3. Fallback extremo: si aún a calidad 5 excede 100KB, reducir resolución a 256px
    let fallback_resized = resized.resize(256, 256, FilterType::Triangle);
    for &quality in &[40, 20, 10, 5] {
        let buf = encode_jpeg(&fallback_resized, quality)?;
        if buf.len() <= MAX_THUMBNAIL_BYTES {
            return Ok(buf);
        }
        last_buffer = buf;
    }

    Err(VisionError::ThumbnailCompressionFailed {
        size_bytes: last_buffer.len(),
        limit_bytes: MAX_THUMBNAIL_BYTES,
    })
}

/// Genera la miniatura y la almacena en la ruta de archivo indicada.
///
/// Retorna la cantidad de bytes escritos.
pub fn generate_thumbnail_to_file(img: &DynamicImage, dest_path: &Path) -> Result<usize> {
    let bytes = generate_thumbnail_bytes(img)?;
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest_path, &bytes)?;
    Ok(bytes.len())
}

/// Carga una imagen desde `src_path`, genera la miniatura y la guarda en `dest_path`.
pub fn generate_thumbnail_from_file(src_path: &Path, dest_path: &Path) -> Result<usize> {
    let img = image::open(src_path)?;
    generate_thumbnail_to_file(&img, dest_path)
}
