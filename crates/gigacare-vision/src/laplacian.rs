//! Análisis de nitidez mediante varianza del operador Laplaciano.
//!
//! Una imagen con bordes definidos y alto contraste produce respuestas
//! de Laplaciano de gran magnitud y alta dispersión (varianza > 100).
//! Una imagen borrosa, difuminada o sin foco atenúa los gradientes,
//! produciendo una varianza baja (< 50).

use image::{DynamicImage, GrayImage};

use crate::error::{Result, VisionError};

/// Umbral estándar de corte para considerar una imagen desenfocada o borrosa.
pub const DEFAULT_BLUR_THRESHOLD: f64 = 100.0;

/// Calcula la varianza del operador Laplaciano sobre una imagen en escala de grises.
///
/// Aplica el kernel estándar de convolución 3x3 de 4 vecinos:
/// ```text
/// [ 0,  1,  0]
/// [ 1, -4,  1]
/// [ 0,  1,  0]
/// ```
///
/// # Errores
/// Retorna `VisionError::ImageTooSmall` si las dimensiones son menores a 3x3.
pub fn laplacian_variance_gray(gray: &GrayImage) -> Result<f64> {
    let width = gray.width();
    let height = gray.height();

    if width < 3 || height < 3 {
        return Err(VisionError::ImageTooSmall { width, height });
    }

    let n = ((width - 2) * (height - 2)) as f64;
    let mut responses = Vec::with_capacity((width - 2) as usize * (height - 2) as usize);
    let mut sum = 0.0f64;

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let center = gray.get_pixel(x, y)[0] as i64;
            let top = gray.get_pixel(x, y - 1)[0] as i64;
            let bottom = gray.get_pixel(x, y + 1)[0] as i64;
            let left = gray.get_pixel(x - 1, y)[0] as i64;
            let right = gray.get_pixel(x + 1, y)[0] as i64;

            let lap = top + bottom + left + right - 4 * center;
            let lap_f64 = lap as f64;
            sum += lap_f64;
            responses.push(lap_f64);
        }
    }

    let mean = sum / n;
    let variance = responses
        .iter()
        .map(|r| {
            let diff = r - mean;
            diff * diff
        })
        .sum::<f64>()
        / n;

    Ok(variance)
}

/// Calcula la varianza del operador Laplaciano convirtiendo cualquier `DynamicImage` a escala de grises.
pub fn laplacian_variance(img: &DynamicImage) -> Result<f64> {
    let gray = img.to_luma8();
    laplacian_variance_gray(&gray)
}

/// Determina si una imagen es borrosa comparando su varianza de Laplaciano contra un umbral.
pub fn is_blurry(variance: f64, threshold: f64) -> bool {
    variance < threshold
}
