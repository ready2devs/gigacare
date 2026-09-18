//! Análisis de frecuencias mediante Transformada Rápida de Fourier (FFT 2D).
//!
//! En el dominio de la frecuencia, los detalles finos, bordes nítidos y texturas
//! corresponden a frecuencias espaciales altas. Las imágenes desenfocadas o con
//! desenfoque de movimiento atenúan o eliminan estas componentes de alta frecuencia.

use image::{imageops::FilterType, DynamicImage, GrayImage};
use num_complex::Complex;
use rustfft::FftPlanner;

use crate::error::{Result, VisionError};

/// Tamaño estándar de análisis para la FFT 2D (128x128 permite análisis en < 1ms).
pub const FFT_ANALYSIS_SIZE: u32 = 128;

/// Radio de corte normalizado por defecto para discriminar frecuencias altas (0.25).
pub const DEFAULT_HIGH_FREQ_CUTOFF: f64 = 0.25;

/// Resultado del análisis espectral por FFT.
#[derive(Debug, Clone, PartialEq)]
pub struct FftAnalysisResult {
    /// Energía acumulada en componentes de alta frecuencia (magnitud).
    pub high_frequency_energy: f64,
    /// Energía total acumulada en todas las componentes (excluyendo componente continua DC).
    pub total_ac_energy: f64,
    /// Proporción de energía en altas frecuencias respecto a la energía total AC (0.0 a 1.0).
    pub high_frequency_ratio: f64,
}

/// Ejecuta la Transformada Rápida de Fourier en 2 dimensiones sobre una matriz cuadrada NxN.
fn fft_2d(matrix: &mut [Complex<f64>], n: usize) {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);

    // 1. FFT a lo largo de cada fila
    for row in 0..n {
        let start = row * n;
        let end = start + n;
        fft.process(&mut matrix[start..end]);
    }

    // 2. Transponer la matriz en sitio
    for i in 0..n {
        for j in (i + 1)..n {
            matrix.swap(i * n + j, j * n + i);
        }
    }

    // 3. FFT a lo largo de las nuevas filas (columnas originales)
    for col in 0..n {
        let start = col * n;
        let end = start + n;
        fft.process(&mut matrix[start..end]);
    }

    // 4. Transponer de nuevo para restaurar orientación
    for i in 0..n {
        for j in (i + 1)..n {
            matrix.swap(i * n + j, j * n + i);
        }
    }
}

/// Analiza el espectro de frecuencias de una imagen en escala de grises mediante FFT 2D.
///
/// La imagen se redimensiona internamente a un lienzo cuadrado de `FFT_ANALYSIS_SIZE` (128x128)
/// para garantizar rendimiento determinista sin importar la resolución original.
pub fn analyze_fft_gray(
    gray: &GrayImage,
    cutoff_ratio: Option<f64>,
) -> Result<FftAnalysisResult> {
    if gray.width() == 0 || gray.height() == 0 {
        return Err(VisionError::ImageTooSmall {
            width: gray.width(),
            height: gray.height(),
        });
    }

    let cutoff = cutoff_ratio.unwrap_or(DEFAULT_HIGH_FREQ_CUTOFF);
    let n = FFT_ANALYSIS_SIZE as usize;

    let resized = image::imageops::resize(
        gray,
        FFT_ANALYSIS_SIZE,
        FFT_ANALYSIS_SIZE,
        FilterType::Lanczos3,
    );

    let mut matrix: Vec<Complex<f64>> = Vec::with_capacity(n * n);
    for y in 0..FFT_ANALYSIS_SIZE {
        for x in 0..FFT_ANALYSIS_SIZE {
            let pixel_val = resized.get_pixel(x, y)[0] as f64;
            matrix.push(Complex::new(pixel_val, 0.0));
        }
    }

    fft_2d(&mut matrix, n);

    let half_n = (n / 2) as f64;
    let mut high_freq_energy = 0.0f64;
    let mut total_ac_energy = 0.0f64;

    for u in 0..n {
        for v in 0..n {
            // Ignorar componente continua DC en (0, 0)
            if u == 0 && v == 0 {
                continue;
            }

            let fu = if u <= n / 2 { u } else { n - u } as f64;
            let fv = if v <= n / 2 { v } else { n - v } as f64;

            let dist = (fu * fu + fv * fv).sqrt();
            let norm_dist = dist / half_n;

            let mag = matrix[u * n + v].norm();
            total_ac_energy += mag;

            if norm_dist >= cutoff {
                high_freq_energy += mag;
            }
        }
    }

    let high_frequency_ratio = if total_ac_energy > 1e-7 {
        high_freq_energy / total_ac_energy
    } else {
        0.0
    };

    Ok(FftAnalysisResult {
        high_frequency_energy: high_freq_energy,
        total_ac_energy,
        high_frequency_ratio,
    })
}

/// Analiza el espectro de frecuencias convirtiendo cualquier `DynamicImage` a escala de grises.
pub fn analyze_fft(
    img: &DynamicImage,
    cutoff_ratio: Option<f64>,
) -> Result<FftAnalysisResult> {
    let gray = img.to_luma8();
    analyze_fft_gray(&gray, cutoff_ratio)
}
