//! # gigacare-hash
//!
//! Funciones de hashing criptográfico (SHA-256) y perceptual (pHash, dHash)
//! para el proyecto GigaCare.
//!
//! - SHA-256: hash criptográfico de archivos y bytes en memoria.
//! - pHash: hash perceptual basado en DCT sobre bitmap 32×32 en escala de grises.
//! - dHash: hash diferencial sobre bitmap 9×8 en escala de grises.
//! - Distancia Hamming: comparación de hashes perceptuales.

use sha2::{Digest, Sha256};
use std::path::Path;

// ─── Errores ───────────────────────────────────────────────────────────────

/// Errores posibles en las operaciones de hashing.
#[derive(Debug, thiserror::Error)]
pub enum HashError {
    /// Error de E/S al leer un archivo.
    #[error("Error de I/O: {0}")]
    Io(#[from] std::io::Error),

    /// Error al decodificar una imagen.
    #[error("Error al procesar imagen: {0}")]
    Image(#[from] image::ImageError),
}

/// Alias de Result con `HashError`.
pub type Result<T> = std::result::Result<T, HashError>;

// ─── SHA-256 ───────────────────────────────────────────────────────────────

/// Calcula el SHA-256 de un archivo y devuelve el hash como cadena hexadecimal
/// en minúsculas.
///
/// # Errores
/// Retorna `HashError::Io` si el archivo no se puede leer.
pub fn sha256_file(path: &Path) -> Result<String> {
    let data = std::fs::read(path)?;
    Ok(sha256_bytes(&data))
}

/// Calcula el SHA-256 de un slice de bytes y devuelve el hash como cadena
/// hexadecimal en minúsculas.
pub fn sha256_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    // Convertir a hex
    result.iter().map(|b| format!("{b:02x}")).collect()
}

// ─── Perceptual Hash ───────────────────────────────────────────────────────

/// Resultado del hash perceptual de una imagen, conteniendo pHash y dHash.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PerceptualHash {
    /// Hash perceptual basado en DCT (64 bits).
    pub phash: u64,
    /// Hash diferencial (64 bits).
    pub dhash: u64,
}

/// Calcula los hashes perceptuales (pHash y dHash) de una imagen en disco.
///
/// - **pHash**: redimensiona a 32×32 en escala de grises, aplica DCT 2D,
///   toma el bloque 8×8 superior izquierdo (excluyendo DC) y compara con la media.
/// - **dHash**: redimensiona a 9×8 en escala de grises, compara píxeles
///   adyacentes horizontalmente → 64 bits.
///
/// # Errores
/// Retorna `HashError::Io` o `HashError::Image` si la imagen no se puede
/// leer o decodificar.
pub fn perceptual_hash(path: &Path) -> Result<PerceptualHash> {
    let img = image::open(path)?;
    let phash = compute_phash(&img);
    let dhash = compute_dhash(&img);
    Ok(PerceptualHash { phash, dhash })
}

/// Calcula los hashes perceptuales a partir de una imagen ya cargada en memoria.
pub fn perceptual_hash_from_image(img: &image::DynamicImage) -> PerceptualHash {
    let phash = compute_phash(img);
    let dhash = compute_dhash(img);
    PerceptualHash { phash, dhash }
}

/// Calcula los hashes perceptuales a partir de bytes de imagen en memoria.
///
/// # Errores
/// Retorna `HashError::Image` si los bytes no se pueden decodificar como imagen.
pub fn perceptual_hash_from_bytes(data: &[u8]) -> Result<PerceptualHash> {
    let img = image::load_from_memory(data)?;
    Ok(perceptual_hash_from_image(&img))
}

// ─── dHash ─────────────────────────────────────────────────────────────────

/// Calcula dHash: redimensiona a 9×8 grayscale, compara pixel[x] > pixel[x+1].
fn compute_dhash(img: &image::DynamicImage) -> u64 {
    use image::imageops::FilterType;

    // Resize a 9 columnas × 8 filas en escala de grises
    let gray = img.resize_exact(9, 8, FilterType::Lanczos3).to_luma8();

    let mut hash: u64 = 0;
    for y in 0..8u32 {
        for x in 0..8u32 {
            let left = gray.get_pixel(x, y)[0];
            let right = gray.get_pixel(x + 1, y)[0];
            hash <<= 1;
            if left > right {
                hash |= 1;
            }
        }
    }
    hash
}

// ─── pHash ─────────────────────────────────────────────────────────────────

/// Calcula pHash: redimensiona a 32×32 grayscale, DCT 2D, bloque 8×8, media.
fn compute_phash(img: &image::DynamicImage) -> u64 {
    use image::imageops::FilterType;

    // 1. Resize a 32×32 grayscale
    let gray = img.resize_exact(32, 32, FilterType::Lanczos3).to_luma8();

    // 2. Convertir a f64
    let mut pixels = [[0.0f64; 32]; 32];
    for y in 0..32 {
        for x in 0..32 {
            pixels[y][x] = gray.get_pixel(x as u32, y as u32)[0] as f64;
        }
    }

    // 3. DCT 2D (Type II)
    let dct = dct2d(&pixels);

    // 4. Tomar bloque 8×8 superior izquierdo (excluyendo el coeficiente DC [0][0])
    let mut values = Vec::with_capacity(63);
    for y in 0..8 {
        for x in 0..8 {
            if y == 0 && x == 0 {
                continue; // Excluir DC
            }
            values.push(dct[y][x]);
        }
    }

    // 5. Calcular media de los 63 coeficientes AC
    let mean: f64 = values.iter().sum::<f64>() / values.len() as f64;

    // 6. Generar hash: bit 1 si coeficiente > media
    let mut hash: u64 = 0;
    for y in 0..8 {
        for x in 0..8 {
            if y == 0 && x == 0 {
                continue;
            }
            hash <<= 1;
            if dct[y][x] > mean {
                hash |= 1;
            }
        }
    }
    hash
}

/// DCT-II 2D para una matriz 32×32.
///
/// Aplica DCT-II por filas y luego por columnas (separable).
fn dct2d(input: &[[f64; 32]; 32]) -> [[f64; 32]; 32] {
    // DCT por filas
    let mut row_dct = [[0.0f64; 32]; 32];
    for y in 0..32 {
        let row: Vec<f64> = (0..32).map(|x| input[y][x]).collect();
        let transformed = dct1d(&row);
        for x in 0..32 {
            row_dct[y][x] = transformed[x];
        }
    }

    // DCT por columnas
    let mut result = [[0.0f64; 32]; 32];
    for x in 0..32 {
        let col: Vec<f64> = (0..32).map(|y| row_dct[y][x]).collect();
        let transformed = dct1d(&col);
        for y in 0..32 {
            result[y][x] = transformed[y];
        }
    }

    result
}

/// DCT-II 1D: transforma un vector de N elementos.
///
/// DCT-II: X[k] = sum_{n=0}^{N-1} x[n] * cos(pi/N * (n + 0.5) * k)
fn dct1d(input: &[f64]) -> Vec<f64> {
    let n = input.len();
    let nf = n as f64;
    (0..n)
        .map(|k| {
            let kf = k as f64;
            input
                .iter()
                .enumerate()
                .map(|(ni, &val)| {
                    let angle = std::f64::consts::PI / nf * (ni as f64 + 0.5) * kf;
                    val * angle.cos()
                })
                .sum::<f64>()
        })
        .collect()
}

// ─── Distancia Hamming ─────────────────────────────────────────────────────

/// Calcula la distancia de Hamming entre dos valores de 64 bits.
///
/// Usa XOR seguido de popcount (contar bits en 1).
#[inline]
pub fn hamming_distance(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

/// Determina si dos `PerceptualHash` son similares según un umbral de
/// distancia Hamming.
///
/// Retorna `true` si **ambos** pHash y dHash tienen distancia ≤ `threshold`.
pub fn are_similar(a: &PerceptualHash, b: &PerceptualHash, threshold: u32) -> bool {
    hamming_distance(a.phash, b.phash) <= threshold
        && hamming_distance(a.dhash, b.dhash) <= threshold
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Valor SHA-256 conocido para la cadena vacía.
    #[test]
    fn test_sha256_bytes_empty() {
        let hash = sha256_bytes(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    /// SHA-256 de "hello world" coincide con valor conocido.
    #[test]
    fn test_sha256_bytes_hello_world() {
        let hash = sha256_bytes(b"hello world");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    /// SHA-256 de bytes arbitrarios conocidos.
    #[test]
    fn test_sha256_bytes_known() {
        let hash = sha256_bytes(b"GigaCare Hash Test");
        // Verificamos que es un hex válido de 64 caracteres
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        // El hash debe ser consistente
        let hash2 = sha256_bytes(b"GigaCare Hash Test");
        assert_eq!(hash, hash2);
    }

    /// SHA-256 de un archivo temporal.
    #[test]
    fn test_sha256_file_tempfile() {
        let mut tmpfile = tempfile::NamedTempFile::new().unwrap();
        tmpfile.write_all(b"hello world").unwrap();
        tmpfile.flush().unwrap();
        let hash = sha256_file(tmpfile.path()).unwrap();
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    /// SHA-256 de archivo inexistente produce error.
    #[test]
    fn test_sha256_file_not_found() {
        let result = sha256_file(Path::new("/no/existe/archivo.txt"));
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, HashError::Io(_)));
    }

    /// Crear una imagen PNG de prueba en memoria (sólido rojo 16×16).
    fn create_test_png(r: u8, g: u8, b: u8) -> Vec<u8> {
        use image::{ImageBuffer, Rgb};
        let img = ImageBuffer::from_fn(16, 16, |_x, _y| Rgb([r, g, b]));
        let mut buf = Vec::new();
        let dyn_img = image::DynamicImage::ImageRgb8(img);
        dyn_img
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    /// pHash y dHash de imágenes idénticas deben ser iguales.
    #[test]
    fn test_phash_identical_images() {
        let png = create_test_png(200, 100, 50);
        let h1 = perceptual_hash_from_bytes(&png).unwrap();
        let h2 = perceptual_hash_from_bytes(&png).unwrap();
        assert_eq!(h1.phash, h2.phash);
        assert_eq!(h1.dhash, h2.dhash);
        assert_eq!(hamming_distance(h1.phash, h2.phash), 0);
        assert_eq!(hamming_distance(h1.dhash, h2.dhash), 0);
    }

    /// pHash distance < 8 para imágenes muy similares (mismo color, ligera variación).
    #[test]
    fn test_phash_similar_images() {
        let png1 = create_test_png(200, 100, 50);
        let png2 = create_test_png(205, 102, 52); // Muy similar
        let h1 = perceptual_hash_from_bytes(&png1).unwrap();
        let h2 = perceptual_hash_from_bytes(&png2).unwrap();
        let dist = hamming_distance(h1.phash, h2.phash);
        assert!(
            dist < 8,
            "pHash distance {dist} should be < 8 for similar images"
        );
    }

    /// dHash funciona y produce resultados consistentes.
    #[test]
    fn test_dhash_consistency() {
        let png = create_test_png(128, 128, 128);
        let h1 = perceptual_hash_from_bytes(&png).unwrap();
        let h2 = perceptual_hash_from_bytes(&png).unwrap();
        assert_eq!(h1.dhash, h2.dhash);
    }

    /// dHash con imagen de archivo temporal.
    #[test]
    fn test_dhash_from_file() {
        let png = create_test_png(100, 150, 200);
        let mut tmpfile = tempfile::Builder::new()
            .suffix(".png")
            .tempfile()
            .unwrap();
        tmpfile.write_all(&png).unwrap();
        tmpfile.flush().unwrap();
        let h = perceptual_hash(tmpfile.path()).unwrap();
        // Verificar que los hashes son valores válidos (no cero necesariamente)
        // Para una imagen sólida, dHash será 0 (todos los píxeles iguales)
        // Eso es comportamiento correcto
        let h2 = perceptual_hash(tmpfile.path()).unwrap();
        assert_eq!(h.dhash, h2.dhash);
        assert_eq!(h.phash, h2.phash);
    }

    /// Hamming distance con valores conocidos.
    #[test]
    fn test_hamming_distance_known_values() {
        // Mismos valores → distancia 0
        assert_eq!(hamming_distance(0, 0), 0);
        assert_eq!(hamming_distance(u64::MAX, u64::MAX), 0);

        // Un solo bit diferente → distancia 1
        assert_eq!(hamming_distance(0b0000, 0b0001), 1);
        assert_eq!(hamming_distance(0b1000, 0b0000), 1);

        // Todos los bits diferentes → distancia 64
        assert_eq!(hamming_distance(0, u64::MAX), 64);

        // Ejemplo específico: 0xFF00 vs 0x00FF → 16 bits diferentes
        assert_eq!(hamming_distance(0xFF00, 0x00FF), 16);

        // Caso intermedio
        assert_eq!(hamming_distance(0b1010, 0b0101), 4);
    }

    /// are_similar retorna true para hashes idénticos.
    #[test]
    fn test_are_similar_identical() {
        let h = PerceptualHash {
            phash: 12345,
            dhash: 67890,
        };
        assert!(are_similar(&h, &h, 0));
        assert!(are_similar(&h, &h, 10));
    }

    /// are_similar retorna false cuando la distancia excede el umbral.
    #[test]
    fn test_are_similar_threshold() {
        let h1 = PerceptualHash {
            phash: 0b0000_0000,
            dhash: 0b0000_0000,
        };
        let h2 = PerceptualHash {
            phash: 0b0000_1111, // 4 bits diferentes
            dhash: 0b0000_0011, // 2 bits diferentes
        };
        // threshold=3: phash distance es 4 > 3, así que no es similar
        assert!(!are_similar(&h1, &h2, 3));
        // threshold=4: phash=4 OK, dhash=2 OK → similar
        assert!(are_similar(&h1, &h2, 4));
        // threshold=10 → similar
        assert!(are_similar(&h1, &h2, 10));
    }

    /// are_similar requiere que AMBOS hashes estén dentro del umbral.
    #[test]
    fn test_are_similar_both_must_match() {
        let h1 = PerceptualHash {
            phash: 0,
            dhash: 0,
        };
        let h2 = PerceptualHash {
            phash: 0,       // phash distance = 0
            dhash: 0xFF,    // dhash distance = 8
        };
        // threshold=5: phash OK pero dhash=8 > 5 → no similar
        assert!(!are_similar(&h1, &h2, 5));
        // threshold=8: ambos OK
        assert!(are_similar(&h1, &h2, 8));
    }

    /// Error type muestra mensajes correctos.
    #[test]
    fn test_error_display() {
        let io_err = HashError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "no encontrado",
        ));
        let msg = format!("{io_err}");
        assert!(msg.contains("I/O"));
    }

    /// perceptual_hash con archivo inexistente produce error.
    #[test]
    fn test_perceptual_hash_file_not_found() {
        let result = perceptual_hash(Path::new("/no/existe/imagen.png"));
        assert!(result.is_err());
    }

    /// perceptual_hash_from_bytes con datos inválidos produce error.
    #[test]
    fn test_perceptual_hash_invalid_bytes() {
        let result = perceptual_hash_from_bytes(b"not an image");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, HashError::Image(_)));
    }

    /// Crear imagen con gradiente para dHash no-trivial.
    #[test]
    fn test_dhash_gradient_image() {
        use image::{ImageBuffer, Luma};
        // Gradiente horizontal: valor del píxel = x * 16
        let img = ImageBuffer::from_fn(64, 64, |x, _y| {
            Luma([(x as f32 / 63.0 * 255.0) as u8])
        });
        let dyn_img = image::DynamicImage::ImageLuma8(img);
        let mut buf = Vec::new();
        dyn_img
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        let h = perceptual_hash_from_bytes(&buf).unwrap();
        // En un gradiente horizontal, cada píxel izquierdo < derecho
        // Así que dHash debería ser todo 0s (left > right es false para gradiente creciente)
        assert_eq!(h.dhash, 0, "dHash of ascending gradient should be 0");
    }

    /// Test que PerceptualHash implementa Debug y Clone.
    #[test]
    fn test_perceptual_hash_traits() {
        let h = PerceptualHash {
            phash: 42,
            dhash: 99,
        };
        let h2 = h; // Copy
        assert_eq!(h, h2); // PartialEq
        let debug = format!("{h:?}"); // Debug
        assert!(debug.contains("42"));
        assert!(debug.contains("99"));
    }

    /// DCT 1D de un vector constante: solo DC component es no-cero.
    #[test]
    fn test_dct1d_constant() {
        let input = vec![1.0; 32];
        let result = dct1d(&input);
        // DC component (k=0): sum of cos(0) * 1 = 32
        assert!((result[0] - 32.0).abs() < 1e-10);
        // AC components deben ser ~0 para señal constante
        for k in 1..32 {
            assert!(
                result[k].abs() < 1e-10,
                "AC component k={k} should be ~0, got {}",
                result[k]
            );
        }
    }
}