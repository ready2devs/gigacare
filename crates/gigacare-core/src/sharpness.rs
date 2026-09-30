use img_hash::image::{DynamicImage, GrayImage};

use crate::error::{CoreError, Result};

/// Calcula la varianza del operador Laplaciano sobre una imagen en escala de grises.
/// Kernel 3x3:
/// [ 0,  1,  0]
/// [ 1, -4,  1]
/// [ 0,  1,  0]
pub fn laplacian_variance_gray(gray: &GrayImage) -> Result<f64> {
    let width = gray.width();
    let height = gray.height();

    if width < 3 || height < 3 {
        return Err(CoreError::Other(format!(
            "Dimensiones insuficientes para Laplaciano: {}x{}",
            width, height
        )));
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

/// Calcula la varianza del operador Laplaciano sobre cualquier DynamicImage.
pub fn laplacian_variance(img: &DynamicImage) -> Result<f64> {
    let gray = img.to_luma8();
    laplacian_variance_gray(&gray)
}

#[cfg(test)]
mod tests {
    use super::*;
    use img_hash::image::{ImageBuffer, Luma};

    #[test]
    fn test_task07_sharpness_synthetic_images() {
        let width = 100u32;
        let height = 100u32;

        // 1. Imagen nítida: patrón de tablero de ajedrez con alto contraste (0 y 255)
        let mut sharp_gray: GrayImage = ImageBuffer::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let pixel_val = if ((x / 4) + (y / 4)) % 2 == 0 { 255 } else { 0 };
                sharp_gray.put_pixel(x, y, Luma([pixel_val]));
            }
        }

        let sharp_variance = laplacian_variance_gray(&sharp_gray).unwrap();
        println!("Varianza de imagen nítida: {}", sharp_variance);
        assert!(
            sharp_variance > 200.0,
            "Imagen nítida debe tener variance > 200, tuvo {}",
            sharp_variance
        );

        // 2. Imagen borrosa (blurred): gradiente extremadamente suave y difuminado
        let mut blur_gray: GrayImage = ImageBuffer::new(width, height);
        for y in 0..height {
            for x in 0..width {
                // Gradiente ultra continuo entre 120 y 135 a lo largo de 100 píxeles
                let pixel_val = 120 + ((x + y) * 15 / (width + height)) as u8;
                blur_gray.put_pixel(x, y, Luma([pixel_val]));
            }
        }

        let blur_variance = laplacian_variance_gray(&blur_gray).unwrap();
        println!("Varianza de imagen borrosa: {}", blur_variance);
        assert!(
            blur_variance < 80.0,
            "Imagen borrosa debe tener variance < 80, tuvo {}",
            blur_variance
        );
    }
}
