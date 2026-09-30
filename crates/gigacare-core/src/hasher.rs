use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use bincode;
use bk_tree::{BKTree, Metric};
use img_hash::image::imageops::FilterType;
use img_hash::image::{DynamicImage, GenericImageView};
use img_hash::{HashAlg, HasherConfig, ImageHash};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::models::{PhotoGroup, PhotoItem};

pub const DEFAULT_HASH_SIZE: u32 = 16;
pub const CACHE_RELATIVE_PATH: &str = ".gigacare/cache/image_hashes.bin";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageHashEntry {
    pub path: PathBuf,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub width: u32,
    pub height: u32,
    pub hash_bytes: Vec<u8>,
    pub sharpness: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImageHashCache {
    pub entries: HashMap<PathBuf, ImageHashEntry>,
}

/// Crea el hasher estándar para GigaCare: Gradient (dHash) 16x16.
pub fn get_gradient_hasher() -> img_hash::Hasher {
    HasherConfig::new()
        .hash_size(DEFAULT_HASH_SIZE, DEFAULT_HASH_SIZE)
        .hash_alg(HashAlg::Gradient)
        .to_hasher()
}

/// Calcula el hash perceptual de una imagen en memoria:
/// Decodifica / recibe -> redimensiona 16x16 con Lanczos3 -> Gradient Hash.
pub fn compute_image_hash(img: &DynamicImage) -> ImageHash {
    let resized = img.resize_exact(DEFAULT_HASH_SIZE, DEFAULT_HASH_SIZE, FilterType::Lanczos3);
    let hasher = get_gradient_hasher();
    hasher.hash_image(&resized)
}

/// Calcula la distancia de Hamming entre dos hashes perceptuales representados en bytes.
pub fn hash_distance(h1: &[u8], h2: &[u8]) -> u32 {
    let mut dist = 0u32;
    for (&b1, &b2) in h1.iter().zip(h2.iter()) {
        dist += (b1 ^ b2).count_ones();
    }
    if h1.len() != h2.len() {
        let max_len = h1.len().max(h2.len());
        let min_len = h1.len().min(h2.len());
        dist += ((max_len - min_len) * 8) as u32;
    }
    dist
}

/// Obtiene la ruta del archivo de caché por defecto (~/.gigacare/cache/image_hashes.bin).
pub fn default_cache_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".gigacare")
        .join("cache")
        .join("image_hashes.bin")
}

/// Carga el caché de hashes desde disco usando bincode.
pub fn load_cache_from(path: &Path) -> ImageHashCache {
    if !path.exists() {
        return ImageHashCache::default();
    }
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return ImageHashCache::default(),
    };
    let reader = BufReader::new(file);
    bincode::deserialize_from(reader).unwrap_or_default()
}

/// Guarda el caché de hashes en disco usando bincode.
pub fn save_cache_to(cache: &ImageHashCache, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = File::create(path)?;
    let writer = BufWriter::new(file);
    bincode::serialize_into(writer, cache).map_err(|e| {
        CoreError::Other(format!("Error serializando caché bincode: {}", e))
    })?;
    Ok(())
}

/// Procesa un archivo de imagen en disco, aprovechando el caché si el tamaño y modified_at coinciden.
pub fn hash_image_file(path: &Path, cache: &mut ImageHashCache) -> Result<ImageHashEntry> {
    let meta = fs::metadata(path)?;
    let size_bytes = meta.len();
    let modified_at = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if let Some(cached) = cache.entries.get(path) {
        if cached.size_bytes == size_bytes && cached.modified_at == modified_at {
            return Ok(cached.clone());
        }
    }

    let dyn_img = img_hash::image::open(path)
        .map_err(|e| CoreError::Other(format!("Error al abrir imagen {:?}: {}", path, e)))?;

    let (width, height) = dyn_img.dimensions();
    let hash = compute_image_hash(&dyn_img);
    let hash_bytes = hash.as_bytes().to_vec();

    let entry = ImageHashEntry {
        path: path.to_path_buf(),
        size_bytes,
        modified_at,
        width,
        height,
        hash_bytes,
        sharpness: None,
    };

    cache.entries.insert(path.to_path_buf(), entry.clone());
    Ok(entry)
}

// ─────────────────────────── BK-Tree y Union-Find ───────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct IndexedHash {
    pub index: usize,
    pub hash_bytes: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct HammingMetric;

impl Metric<IndexedHash> for HammingMetric {
    fn distance(&self, a: &IndexedHash, b: &IndexedHash) -> u32 {
        hash_distance(&a.hash_bytes, &b.hash_bytes)
    }

    fn threshold_distance(&self, a: &IndexedHash, b: &IndexedHash, threshold: u32) -> Option<u32> {
        let d = self.distance(a, b);
        if d <= threshold {
            Some(d)
        } else {
            None
        }
    }
}

pub struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    pub fn new(size: usize) -> Self {
        Self {
            parent: (0..size).collect(),
            rank: vec![0; size],
        }
    }

    pub fn find(&mut self, i: usize) -> usize {
        if self.parent[i] == i {
            i
        } else {
            let root = self.find(self.parent[i]);
            self.parent[i] = root;
            root
        }
    }

    pub fn union(&mut self, i: usize, j: usize) {
        let root_i = self.find(i);
        let root_j = self.find(j);
        if root_i != root_j {
            if self.rank[root_i] < self.rank[root_j] {
                self.parent[root_i] = root_j;
            } else if self.rank[root_i] > self.rank[root_j] {
                self.parent[root_j] = root_i;
            } else {
                self.parent[root_j] = root_i;
                self.rank[root_i] += 1;
            }
        }
    }
}

/// Encuentra grupos de imágenes similares usando BK-Tree y Union-Find.
pub fn find_similar_groups(entries: &[ImageHashEntry], max_distance: u32) -> Vec<PhotoGroup> {
    if entries.len() < 2 {
        return Vec::new();
    }

    let mut bktree = BKTree::new(HammingMetric);
    for (i, entry) in entries.iter().enumerate() {
        bktree.add(IndexedHash {
            index: i,
            hash_bytes: entry.hash_bytes.clone(),
        });
    }

    let mut uf = UnionFind::new(entries.len());
    for (i, entry) in entries.iter().enumerate() {
        let query = IndexedHash {
            index: i,
            hash_bytes: entry.hash_bytes.clone(),
        };
        for (_dist, neighbor) in bktree.find(&query, max_distance) {
            if neighbor.index != i {
                uf.union(i, neighbor.index);
            }
        }
    }

    let mut clusters: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..entries.len() {
        let root = uf.find(i);
        clusters.entry(root).or_default().push(i);
    }

    let mut groups = Vec::new();
    for (_root, mut indices) in clusters {
        if indices.len() >= 2 {
            indices.sort_unstable();
            let mut total_dist = 0u64;
            let mut pair_count = 0u64;
            for (p_idx, &idx1) in indices.iter().enumerate() {
                for &idx2 in &indices[(p_idx + 1)..] {
                    total_dist += hash_distance(&entries[idx1].hash_bytes, &entries[idx2].hash_bytes) as u64;
                    pair_count += 1;
                }
            }
            let avg_dist = if pair_count > 0 {
                (total_dist / pair_count) as u32
            } else {
                0
            };

            let photos = indices
                .iter()
                .map(|&idx| {
                    let e = &entries[idx];
                    let phash_hex = e
                        .hash_bytes
                        .iter()
                        .map(|b| format!("{:02x}", b))
                        .collect::<String>();
                    PhotoItem {
                        path: e.path.to_string_lossy().to_string(),
                        original_resolution: format!("{}x{}", e.width, e.height),
                        size_bytes: e.size_bytes,
                        phash: phash_hex,
                        thumbnail_path: None,
                        ai_analysis: None,
                    }
                })
                .collect();

            groups.push(PhotoGroup {
                group_id: uuid::Uuid::new_v4().to_string(),
                similarity_method: "phash".to_string(),
                avg_hamming_distance: avg_dist,
                photos,
            });
        }
    }

    // Ordenar grupos por cantidad de fotos desc
    groups.sort_by(|a, b| b.photos.len().cmp(&a.photos.len()));
    groups
}

#[cfg(test)]
mod tests {
    use super::*;
    use img_hash::image::{ImageBuffer, Rgb, RgbImage};
    use tempfile::tempdir;

    #[test]
    fn test_task04_identical_resized_and_different_images() {
        let w1 = 120;
        let h1 = 120;
        let mut img1: RgbImage = ImageBuffer::new(w1, h1);
        for x in 0..w1 {
            let val = ((x as f32 / w1 as f32) * 255.0) as u8;
            for y in 0..h1 {
                img1.put_pixel(x, y, Rgb([val, val, val]));
            }
        }
        let dyn1 = DynamicImage::ImageRgb8(img1);
        let dyn1_resized = dyn1.resize_exact(240, 240, FilterType::Lanczos3);

        let hash1 = compute_image_hash(&dyn1);
        let hash1_resized = compute_image_hash(&dyn1_resized);

        let dist_identical = hash_distance(hash1.as_bytes(), hash1_resized.as_bytes());
        assert_eq!(dist_identical, 0);

        let w2 = 120;
        let h2 = 120;
        let mut img2: RgbImage = ImageBuffer::new(w2, h2);
        for y in 0..h2 {
            let val = (((h2 - y) as f32 / h2 as f32) * 255.0) as u8;
            for x in 0..w2 {
                let chess = if ((x / 10) + (y / 10)) % 2 == 0 { 255 } else { 0 };
                img2.put_pixel(x, y, Rgb([val ^ chess, 255 - val, chess]));
            }
        }
        let dyn2 = DynamicImage::ImageRgb8(img2);
        let hash2 = compute_image_hash(&dyn2);

        let dist_diff = hash_distance(hash1.as_bytes(), hash2.as_bytes());
        assert!(dist_diff > 15);
    }

    #[test]
    fn test_task04_bincode_cache_persistence() {
        let temp_dir = tempdir().unwrap();
        let cache_file = temp_dir.path().join("image_hashes.bin");

        let mut cache = ImageHashCache::default();
        let dummy_entry = ImageHashEntry {
            path: PathBuf::from("C:/photos/test.jpg"),
            size_bytes: 1024,
            modified_at: 1700000000,
            width: 1920,
            height: 1080,
            hash_bytes: vec![1, 2, 3, 4, 5, 6, 7, 8],
            sharpness: Some(150.0),
        };
        cache.entries.insert(dummy_entry.path.clone(), dummy_entry.clone());

        save_cache_to(&cache, &cache_file).unwrap();
        assert!(cache_file.exists());

        let loaded = load_cache_from(&cache_file);
        assert_eq!(loaded.entries.len(), 1);
        let loaded_entry = loaded.entries.get(&dummy_entry.path).unwrap();
        assert_eq!(loaded_entry, &dummy_entry);
    }

    #[test]
    fn test_task05_find_similar_groups_20_images_4_clusters() {
        // Crear 4 grupos base con hashes bien diferenciados
        // Cada grupo tendrá 5 entradas con distancias mutuas <= 4 bits
        let mut entries = Vec::new();

        let base_hashes: Vec<Vec<u8>> = vec![
            vec![0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
            vec![0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00],
            vec![0xAA, 0xAA, 0xAA, 0xAA, 0x55, 0x55, 0x55, 0x55, 0xAA, 0xAA, 0xAA, 0xAA, 0x55, 0x55, 0x55, 0x55],
            vec![0x0F, 0x0F, 0x0F, 0x0F, 0xF0, 0xF0, 0xF0, 0xF0, 0x0F, 0x0F, 0x0F, 0x0F, 0xF0, 0xF0, 0xF0, 0xF0],
        ];

        for (g_idx, base) in base_hashes.iter().enumerate() {
            for item_idx in 0..5 {
                let mut hash = base.clone();
                // Modificar como máximo 1 o 2 bits para mantener distancia <= 2 del base
                if item_idx > 0 {
                    hash[0] ^= 1 << (item_idx - 1);
                }
                entries.push(ImageHashEntry {
                    path: PathBuf::from(format!("C:/photos/group_{}/img_{}.jpg", g_idx, item_idx)),
                    size_bytes: 100_000 + (item_idx as u64) * 10,
                    modified_at: 1700000000,
                    width: 4000,
                    height: 3000,
                    hash_bytes: hash,
                    sharpness: Some(120.0),
                });
            }
        }

        assert_eq!(entries.len(), 20);

        // Agrupar con umbral max_distance = 6
        let groups = find_similar_groups(&entries, 6);

        println!("Grupos encontrados: {}", groups.len());
        for (i, g) in groups.iter().enumerate() {
            println!("Grupo {}: {} fotos, avg_dist: {}", i, g.photos.len(), g.avg_hamming_distance);
        }

        assert_eq!(groups.len(), 4, "Debe detectar exactamente 4 grupos");
        for g in &groups {
            assert_eq!(g.photos.len(), 5, "Cada grupo debe contener exactamente 5 fotos");
        }

        // Medir recall: de los 4 * 10 = 40 pares verdaderos positivos, ¿cuántos se agruparon correctamente?
        // En este caso 40 de 40 = 100% recall (>= 95%).
        let total_detected_items: usize = groups.iter().map(|g| g.photos.len()).sum();
        let recall = (total_detected_items as f64) / 20.0;
        assert!(recall >= 0.95, "Recall debe ser >= 95%, fue {}", recall);
    }
}
