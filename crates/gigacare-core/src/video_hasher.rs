use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::hasher::{compute_image_hash, hash_distance};

pub const NUM_VIDEO_FRAMES: usize = 8;
pub const DEFAULT_DURATION_TOLERANCE_RATIO: f64 = 0.10; // ±10%
pub const DEFAULT_SIMILARITY_MATCH_RATIO: f64 = 0.60;   // ≥60%
pub const DEFAULT_HAMMING_TOLERANCE: u32 = 10;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoHashEntry {
    pub path: PathBuf,
    pub duration_seconds: f64,
    pub frame_hashes: Vec<Vec<u8>>,
}

/// Comprueba si dos duraciones de video están dentro de la tolerancia (por defecto ±10%).
pub fn are_durations_similar(d1: f64, d2: f64, tolerance_ratio: f64) -> bool {
    let max_d = d1.max(d2);
    if max_d <= 0.0 {
        return (d1 - d2).abs() < 1e-4;
    }
    let diff = (d1 - d2).abs();
    (diff / max_d) <= tolerance_ratio
}

/// Compara dos secuencias de frame-hashes y retorna el número de coincidencias y la proporción.
pub fn compare_frame_hashes(
    hashes1: &[Vec<u8>],
    hashes2: &[Vec<u8>],
    hamming_tolerance: u32,
) -> (usize, f64) {
    if hashes1.is_empty() || hashes2.is_empty() {
        return (0, 0.0);
    }
    let total_frames = hashes1.len().min(hashes2.len());
    let mut matches = 0;

    for (h1, h2) in hashes1.iter().zip(hashes2.iter()) {
        if hash_distance(h1, h2) <= hamming_tolerance {
            matches += 1;
        }
    }

    let ratio = (matches as f64) / (total_frames as f64);
    (matches, ratio)
}

/// Determina si dos videos son similares según su coincidencia de frames (por defecto ≥60%).
pub fn are_videos_similar(
    hashes1: &[Vec<u8>],
    hashes2: &[Vec<u8>],
    hamming_tolerance: u32,
    min_match_ratio: f64,
) -> bool {
    let (_matches, ratio) = compare_frame_hashes(hashes1, hashes2, hamming_tolerance);
    ratio >= min_match_ratio
}

/// Obtiene la duración de un video usando ffprobe.
pub fn get_video_duration(video_path: &Path) -> Result<f64> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(video_path)
        .output()
        .map_err(|e| CoreError::Other(format!("ffprobe no encontrado o fallo al ejecutar: {}", e)))?;

    if !output.status.success() {
        return Err(CoreError::Other(format!(
            "ffprobe falló con salida de error: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    let dur: f64 = out_str.trim().parse().map_err(|e| {
        CoreError::Other(format!("Error parseando duración de ffprobe: {}", e))
    })?;
    Ok(dur)
}

/// Extrae 8 frames equidistantes de un video usando FFmpeg y calcula el hash perceptual de cada uno.
pub fn extract_video_frame_hashes(video_path: &Path, duration: f64) -> Result<Vec<Vec<u8>>> {
    if duration <= 0.0 {
        return Err(CoreError::Other("Duración de video no válida".to_string()));
    }

    let mut hashes = Vec::with_capacity(NUM_VIDEO_FRAMES);
    let step = duration / (NUM_VIDEO_FRAMES as f64 + 1.0);

    for i in 1..=NUM_VIDEO_FRAMES {
        let timestamp = step * (i as f64);
        let time_str = format!("{:.3}", timestamp);

        let output = Command::new("ffmpeg")
            .args([
                "-ss", &time_str,
                "-i",
            ])
            .arg(video_path)
            .args([
                "-vframes", "1",
                "-f", "image2pipe",
                "-vcodec", "bmp",
                "-",
            ])
            .output()
            .map_err(|e| CoreError::Other(format!("ffmpeg no disponible o fallo de ejecución: {}", e)))?;

        if !output.status.success() || output.stdout.is_empty() {
            // Si falla la extracción de algún frame, insertar un hash vacío o continuar
            hashes.push(vec![0u8; 16]);
            continue;
        }

        match img_hash::image::load_from_memory(&output.stdout) {
            Ok(dyn_img) => {
                let h = compute_image_hash(&dyn_img);
                hashes.push(h.as_bytes().to_vec());
            }
            Err(_) => {
                hashes.push(vec![0u8; 16]);
            }
        }
    }

    Ok(hashes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task06_video_duration_grouping() {
        assert!(are_durations_similar(100.0, 105.0, 0.10)); // 5% diff <= 10% -> true
        assert!(are_durations_similar(100.0, 92.0, 0.10));  // 8% diff <= 10% -> true
        assert!(!are_durations_similar(100.0, 80.0, 0.10)); // 20% diff > 10% -> false
        assert!(!are_durations_similar(100.0, 130.0, 0.10)); // 30% diff > 10% -> false
    }

    #[test]
    fn test_task06_mock_frame_hashes_similarity_verification() {
        // Generar hash dummy base
        let base_hash = vec![0xAA; 16];
        let diff_hash = vec![0x55; 16]; // Distancia Hamming muy alta con 0xAA (8 bits por byte * 16 = 128)

        let mut video_a_hashes = Vec::with_capacity(8);
        for _ in 0..8 {
            video_a_hashes.push(base_hash.clone());
        }

        // Caso 1: 6 de 8 frames coinciden (6/8 = 75% >= 60%) -> DEBEN ser similares
        let mut video_b_hashes = Vec::with_capacity(8);
        for i in 0..8 {
            if i < 6 {
                video_b_hashes.push(base_hash.clone());
            } else {
                video_b_hashes.push(diff_hash.clone());
            }
        }

        let (matches_6, ratio_6) = compare_frame_hashes(&video_a_hashes, &video_b_hashes, 10);
        assert_eq!(matches_6, 6);
        assert_eq!(ratio_6, 0.75);
        assert!(
            are_videos_similar(&video_a_hashes, &video_b_hashes, 10, DEFAULT_SIMILARITY_MATCH_RATIO),
            "6 de 8 frames matching (75% >= 60%) deben considerarse similares"
        );

        // Caso 2: 2 de 8 frames coinciden (2/8 = 25% < 60%) -> NO deben ser similares
        let mut video_c_hashes = Vec::with_capacity(8);
        for i in 0..8 {
            if i < 2 {
                video_c_hashes.push(base_hash.clone());
            } else {
                video_c_hashes.push(diff_hash.clone());
            }
        }

        let (matches_2, ratio_2) = compare_frame_hashes(&video_a_hashes, &video_c_hashes, 10);
        assert_eq!(matches_2, 2);
        assert_eq!(ratio_2, 0.25);
        assert!(
            !are_videos_similar(&video_a_hashes, &video_c_hashes, 10, DEFAULT_SIMILARITY_MATCH_RATIO),
            "2 de 8 frames matching (25% < 60%) NO deben considerarse similares"
        );
    }
}
