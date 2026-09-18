//! # gigacare-vision
//!
//! Subsistema de visión y análisis de imágenes para GigaCare:
//! - Análisis de nitidez mediante varianza del operador Laplaciano (grises).
//! - Análisis espectral mediante Transformada Rápida de Fourier (FFT 2D) para detección de frecuencias altas.
//! - Generación de miniaturas JPEG cumpliendo restricciones: <= 512px lado mayor, <= 100KB, compresión adaptativa.

pub mod error;
pub mod fft;
pub mod laplacian;
pub mod thumbnail;

pub use error::{VisionError, Result};
pub use fft::{
    analyze_fft, analyze_fft_gray, FftAnalysisResult, DEFAULT_HIGH_FREQ_CUTOFF, FFT_ANALYSIS_SIZE,
};
pub use laplacian::{
    is_blurry, laplacian_variance, laplacian_variance_gray, DEFAULT_BLUR_THRESHOLD,
};
pub use thumbnail::{
    generate_thumbnail_bytes, generate_thumbnail_from_file, generate_thumbnail_to_file,
    DEFAULT_INITIAL_JPEG_QUALITY, MAX_THUMBNAIL_BYTES, MAX_THUMBNAIL_DIMENSION_PX,
};

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, GrayImage, Rgb, RgbImage};
    use tempfile::tempdir;

    /// Crea una imagen nítida sintética (tablero de ajedrez de 100x100 con bloques de 10x10 alternando 0 y 255).
    fn create_sharp_image(width: u32, height: u32) -> GrayImage {
        let mut img = GrayImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let check = ((x / 10) + (y / 10)) % 2 == 0;
                img.put_pixel(x, y, image::Luma([if check { 255 } else { 0 }]));
            }
        }
        img
    }

    /// Crea una imagen borrosa sintética (gradiente extremadamente suave donde cada píxel varía de forma continua).
    fn create_blurry_image(width: u32, height: u32) -> GrayImage {
        let mut img = GrayImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                // Variación muy suave en el rango de 100 a 140
                let val = (100.0 + 40.0 * ((x as f64 / width as f64) + (y as f64 / height as f64)) / 2.0) as u8;
                img.put_pixel(x, y, image::Luma([val]));
            }
        }
        img
    }

    #[test]
    fn test_laplacian_sharpness_verification() {
        let sharp = create_sharp_image(100, 100);
        let blurry = create_blurry_image(100, 100);

        let sharp_score = laplacian_variance_gray(&sharp).unwrap();
        let blurry_score = laplacian_variance_gray(&blurry).unwrap();

        // Verificación exigida por la especificación:
        // imagen nítida score > 100, borrosa < 50
        assert!(
            sharp_score > 100.0,
            "La imagen nítida debe tener un score > 100, obtenido: {}",
            sharp_score
        );
        assert!(
            blurry_score < 50.0,
            "La imagen borrosa debe tener un score < 50, obtenido: {}",
            blurry_score
        );

        assert!(!is_blurry(sharp_score, DEFAULT_BLUR_THRESHOLD));
        assert!(is_blurry(blurry_score, DEFAULT_BLUR_THRESHOLD));
    }

    #[test]
    fn test_laplacian_image_too_small() {
        let tiny = GrayImage::new(2, 2);
        let res = laplacian_variance_gray(&tiny);
        assert!(res.is_err());
        match res.unwrap_err() {
            VisionError::ImageTooSmall { width, height } => {
                assert_eq!(width, 2);
                assert_eq!(height, 2);
            }
            other => panic!("Esperaba ImageTooSmall pero obtuve: {:?}", other),
        }
    }

    #[test]
    fn test_fft_high_frequency_detection() {
        let sharp = create_sharp_image(128, 128);
        let blurry = create_blurry_image(128, 128);

        let sharp_fft = analyze_fft_gray(&sharp, None).unwrap();
        let blurry_fft = analyze_fft_gray(&blurry, None).unwrap();

        // La imagen nítida debe contener sustancialmente mayor energía de altas frecuencias
        assert!(sharp_fft.high_frequency_energy > blurry_fft.high_frequency_energy);
        assert!(sharp_fft.high_frequency_ratio > blurry_fft.high_frequency_ratio);
        assert!(sharp_fft.high_frequency_ratio > 0.05);
    }

    #[test]
    fn test_thumbnail_generation_constraints() {
        // Crear imagen grande de alta resolución (1200x800)
        let mut large_rgb = RgbImage::new(1200, 800);
        for y in 0..800 {
            for x in 0..1200 {
                large_rgb.put_pixel(
                    x,
                    y,
                    Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8]),
                );
            }
        }
        let dynamic_img = DynamicImage::ImageRgb8(large_rgb);

        let thumb_bytes = generate_thumbnail_bytes(&dynamic_img).unwrap();

        // 1. Restricción de peso máximo: <= 100 KB (102,400 bytes)
        assert!(
            thumb_bytes.len() <= MAX_THUMBNAIL_BYTES,
            "Miniatura pesa {} bytes, debe ser <= {}",
            thumb_bytes.len(),
            MAX_THUMBNAIL_BYTES
        );

        // 2. Restricción de dimensiones: lado mayor <= 512px
        let decoded = image::load_from_memory(&thumb_bytes).unwrap();
        let max_dim = decoded.width().max(decoded.height());
        assert!(
            max_dim <= MAX_THUMBNAIL_DIMENSION_PX,
            "Lado mayor {} px debe ser <= {}",
            max_dim,
            MAX_THUMBNAIL_DIMENSION_PX
        );
        // Debe preservar proporción: 1200x800 -> 512x341
        assert_eq!(decoded.width(), 512);
        assert_eq!(decoded.height(), 341);
    }

    #[test]
    fn test_thumbnail_to_file_and_small_images() {
        let tmp = tempdir().unwrap();
        let dest = tmp.path().join("sub").join("thumb.jpg");

        // Imagen pequeña (200x150), menor que 512px
        let small_rgb = RgbImage::new(200, 150);
        let dynamic_img = DynamicImage::ImageRgb8(small_rgb);

        let bytes_written = generate_thumbnail_to_file(&dynamic_img, &dest).unwrap();
        assert!(dest.exists());
        assert_eq!(bytes_written, std::fs::metadata(&dest).unwrap().len() as usize);
        assert!(bytes_written <= MAX_THUMBNAIL_BYTES);

        let decoded = image::open(&dest).unwrap();
        assert_eq!(decoded.width(), 200);
        assert_eq!(decoded.height(), 150);
    }

    #[test]
    fn test_dynamic_image_wrappers() {
        let sharp = DynamicImage::ImageLuma8(create_sharp_image(50, 50));
        let var = laplacian_variance(&sharp).unwrap();
        assert!(var > 100.0);

        let fft_res = analyze_fft(&sharp, Some(0.3)).unwrap();
        assert!(fft_res.total_ac_energy > 0.0);
    }

    #[test]
    fn test_thumbnail_from_file() {
        let tmp = tempdir().unwrap();
        let src_path = tmp.path().join("source.png");
        let dest_path = tmp.path().join("thumb.jpg");

        let img = create_sharp_image(300, 200);
        img.save(&src_path).unwrap();

        let bytes = generate_thumbnail_from_file(&src_path, &dest_path).unwrap();
        assert!(dest_path.exists());
        assert!(bytes <= MAX_THUMBNAIL_BYTES);
    }

    #[test]
    fn test_iterative_compression_reduces_quality_under_limit() {
        // Crear una imagen con ruido/textura de alta frecuencia que pese mucho en JPEG
        let mut noise_rgb = RgbImage::new(512, 512);
        for y in 0..512 {
            for x in 0..512 {
                let pseudo_random = ((x * 37 + y * 73 + (x ^ y)) % 256) as u8;
                noise_rgb.put_pixel(x, y, Rgb([pseudo_random, 255 - pseudo_random, (pseudo_random.wrapping_mul(3))]));
            }
        }
        let dynamic_img = DynamicImage::ImageRgb8(noise_rgb);

        let thumb_bytes = generate_thumbnail_bytes(&dynamic_img).unwrap();
        assert!(
            thumb_bytes.len() <= MAX_THUMBNAIL_BYTES,
            "Incluso con textura ruidosa, la miniatura debe pesar <= 100KB, pero pesó: {} bytes",
            thumb_bytes.len()
        );
    }
}
