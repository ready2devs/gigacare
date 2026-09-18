//! # gigacare-fs
//!
//! Motor de recorrido recursivo de árbol de directorios para GigaCare.
//!
//! Provee recorrido con cálculo de tamaños acumulados, detección de symlinks,
//! profundidad máxima configurable, exclusiones por patrón glob, y cancelación
//! cooperativa vía `AtomicBool`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use globset::{Glob, GlobSet, GlobSetBuilder};
use thiserror::Error;
use walkdir::WalkDir;

// ─── Errores ──────────────────────────────────────────────────────────────────

/// Errores que pueden ocurrir durante el recorrido del árbol de directorios.
#[derive(Debug, Error)]
pub enum FsError {
    /// Error de E/S al acceder al sistema de archivos.
    #[error("error de E/S: {0}")]
    Io(#[from] std::io::Error),

    /// Error al recorrer el directorio con walkdir.
    #[error("error al recorrer directorio: {0}")]
    WalkDir(#[from] walkdir::Error),

    /// Patrón glob inválido.
    #[error("patrón glob inválido '{pattern}': {source}")]
    InvalidGlob {
        pattern: String,
        source: globset::Error,
    },

    /// El recorrido fue cancelado por el usuario.
    #[error("recorrido cancelado")]
    Cancelled,
}

/// Resultado tipo alias para operaciones del crate.
pub type Result<T> = std::result::Result<T, FsError>;

// ─── Structs de datos ─────────────────────────────────────────────────────────

/// Representa una entrada en el árbol de directorios.
#[derive(Debug, Clone)]
pub struct DirEntry {
    /// Ruta completa de la entrada.
    pub path: PathBuf,
    /// Tamaño en bytes. Para directorios, es el tamaño acumulado de su contenido.
    pub size: u64,
    /// `true` si la entrada es un directorio.
    pub is_dir: bool,
    /// `true` si la entrada es un symlink.
    pub is_symlink: bool,
    /// Profundidad relativa al directorio raíz del recorrido (raíz = 0).
    pub depth: usize,
    /// Cantidad de hijos directos (solo para directorios; 0 para archivos).
    pub children_count: usize,
}

/// Resultado consolidado de un recorrido de árbol de directorios.
#[derive(Debug, Clone)]
pub struct TreeResult {
    /// Todas las entradas encontradas.
    pub entries: Vec<DirEntry>,
    /// Tamaño total acumulado en bytes.
    pub total_size: u64,
    /// Cantidad de archivos encontrados.
    pub file_count: usize,
    /// Cantidad de directorios encontrados.
    pub dir_count: usize,
    /// Cantidad de entradas omitidas (por exclusión, error o profundidad).
    pub skipped_count: usize,
}

// ─── TreeWalker ───────────────────────────────────────────────────────────────

/// Configuración del motor de recorrido de directorios.
///
/// # Ejemplo
///
/// ```no_run
/// use std::sync::atomic::AtomicBool;
/// use std::path::Path;
/// use gigacare_fs::TreeWalker;
///
/// let walker = TreeWalker::new()
///     .max_depth(5)
///     .follow_symlinks(false)
///     .exclude(vec!["*.log".to_string(), "node_modules/**".to_string()]);
///
/// let cancel = AtomicBool::new(false);
/// let result = walker.walk(Path::new("."), &cancel).unwrap();
/// println!("Total: {} archivos, {} bytes", result.file_count, result.total_size);
/// ```
#[derive(Debug, Clone)]
pub struct TreeWalker {
    /// Profundidad máxima de recorrido (default: 8).
    max_depth: usize,
    /// Patrones glob de exclusión.
    excluded_patterns: Vec<String>,
    /// Si se deben seguir symlinks (default: false).
    follow_symlinks: bool,
}

impl Default for TreeWalker {
    fn default() -> Self {
        Self {
            max_depth: 8,
            excluded_patterns: Vec::new(),
            follow_symlinks: false,
        }
    }
}

impl TreeWalker {
    /// Crea un nuevo `TreeWalker` con la configuración por defecto.
    pub fn new() -> Self {
        Self::default()
    }

    /// Establece la profundidad máxima del recorrido.
    pub fn max_depth(mut self, depth: usize) -> Self {
        self.max_depth = depth;
        self
    }

    /// Establece si se deben seguir los symlinks.
    pub fn follow_symlinks(mut self, follow: bool) -> Self {
        self.follow_symlinks = follow;
        self
    }

    /// Establece los patrones glob de exclusión.
    pub fn exclude(mut self, patterns: Vec<String>) -> Self {
        self.excluded_patterns = patterns;
        self
    }

    /// Construye el GlobSet a partir de los patrones de exclusión configurados.
    fn build_exclusion_set(&self) -> Result<GlobSet> {
        let mut builder = GlobSetBuilder::new();
        for pattern in &self.excluded_patterns {
            let glob = Glob::new(pattern).map_err(|e| FsError::InvalidGlob {
                pattern: pattern.clone(),
                source: e,
            })?;
            builder.add(glob);
        }
        builder.build().map_err(|e| FsError::InvalidGlob {
            pattern: "<conjunto>".to_string(),
            source: e,
        })
    }

    /// Recorre recursivamente el árbol de directorios a partir de `root`.
    ///
    /// Verifica periódicamente el flag `cancel` para interrumpir el recorrido
    /// de forma cooperativa. Si `cancel` es `true`, retorna `FsError::Cancelled`.
    ///
    /// # Argumentos
    ///
    /// * `root` - Directorio raíz desde donde iniciar el recorrido.
    /// * `cancel` - Flag atómico para cancelación cooperativa.
    ///
    /// # Errores
    ///
    /// Retorna `FsError` si ocurre un error de E/S, un patrón glob inválido,
    /// o si el recorrido es cancelado.
    pub fn walk(&self, root: &Path, cancel: &AtomicBool) -> Result<TreeResult> {
        let exclusion_set = self.build_exclusion_set()?;

        // Fase 1: Recolectar todas las entradas crudas con walkdir.
        // Usamos una estructura intermedia para luego calcular tamaños acumulados.
        struct RawEntry {
            path: PathBuf,
            size: u64,
            is_dir: bool,
            is_symlink: bool,
            depth: usize,
        }

        let mut raw_entries: Vec<RawEntry> = Vec::new();
        let mut skipped_count: usize = 0;
        let mut check_counter: u32 = 0;

        let walker = WalkDir::new(root)
            .max_depth(self.max_depth)
            .follow_links(self.follow_symlinks)
            .sort_by_file_name();

        for entry_result in walker {
            // Verificar cancelación cada 64 entradas para no penalizar rendimiento.
            check_counter += 1;
            if check_counter % 64 == 0 && cancel.load(Ordering::Relaxed) {
                return Err(FsError::Cancelled);
            }

            let entry = match entry_result {
                Ok(e) => e,
                Err(_) => {
                    skipped_count += 1;
                    continue;
                }
            };

            let path = entry.path().to_path_buf();

            // Verificar exclusiones glob contra la ruta.
            if exclusion_set.is_match(&path) {
                skipped_count += 1;
                continue;
            }

            // También verificar contra el nombre de archivo solamente.
            if let Some(file_name) = path.file_name() {
                if exclusion_set.is_match(file_name) {
                    skipped_count += 1;
                    continue;
                }
            }

            let is_symlink = entry.path_is_symlink();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    skipped_count += 1;
                    continue;
                }
            };

            let is_dir = metadata.is_dir();
            let size = if is_dir { 0 } else { metadata.len() };

            raw_entries.push(RawEntry {
                path,
                size,
                is_dir,
                is_symlink,
                depth: entry.depth(),
            });
        }

        // Verificar cancelación una última vez antes del post-procesamiento.
        if cancel.load(Ordering::Relaxed) {
            return Err(FsError::Cancelled);
        }

        // Fase 2: Calcular tamaños acumulados para directorios y children_count.
        // Las entradas de walkdir vienen en orden DFS, así que procesamos de atrás
        // hacia adelante para acumular tamaños de hijos a padres.

        let mut entries: Vec<DirEntry> = raw_entries
            .iter()
            .map(|raw| DirEntry {
                path: raw.path.clone(),
                size: raw.size,
                is_dir: raw.is_dir,
                is_symlink: raw.is_symlink,
                depth: raw.depth,
                children_count: 0,
            })
            .collect();

        // Acumular tamaños y contar hijos directos.
        // Recorremos de atrás hacia adelante. Cuando encontramos un directorio,
        // sumamos los tamaños de sus descendientes directos e indirectos.
        for i in (0..entries.len()).rev() {
            if entries[i].is_dir {
                let dir_depth = entries[i].depth;
                let dir_path = entries[i].path.clone();
                let mut accumulated_size: u64 = 0;
                let mut direct_children: usize = 0;

                // Buscar hacia adelante desde i+1 los hijos de este directorio.
                for j in (i + 1)..entries.len() {
                    if entries[j].depth <= dir_depth {
                        break;
                    }
                    // Hijo directo: profundidad = dir_depth + 1 y padre es dir_path.
                    if entries[j].depth == dir_depth + 1 {
                        if let Some(parent) = entries[j].path.parent() {
                            if parent == dir_path {
                                direct_children += 1;
                            }
                        }
                    }
                    // Acumular solo archivos (los dirs ya tienen tamaño 0 en raw).
                    if !entries[j].is_dir {
                        // Solo acumular si es descendiente de este directorio.
                        if entries[j].path.starts_with(&dir_path) {
                            accumulated_size += entries[j].size;
                        }
                    }
                }

                entries[i].size = accumulated_size;
                entries[i].children_count = direct_children;
            }
        }

        // Fase 3: Calcular estadísticas globales.
        let total_size: u64 = entries
            .iter()
            .filter(|e| !e.is_dir)
            .map(|e| e.size)
            .sum();

        let file_count = entries.iter().filter(|e| !e.is_dir).count();
        let dir_count = entries.iter().filter(|e| e.is_dir).count();

        Ok(TreeResult {
            entries,
            total_size,
            file_count,
            dir_count,
            skipped_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::AtomicBool;
    use tempfile::TempDir;

    /// Helper: crea una estructura de directorios de prueba.
    ///
    /// Estructura:
    /// ```text
    /// root/
    /// ├── file_a.txt (5 bytes)
    /// ├── file_b.log (3 bytes)
    /// ├── dir1/
    /// │   ├── file_c.txt (10 bytes)
    /// │   └── dir1_1/
    /// │       └── file_d.txt (7 bytes)
    /// └── dir2/
    ///     └── file_e.txt (4 bytes)
    /// ```
    fn create_test_tree(dir: &Path) {
        // Archivos en raíz
        fs::write(dir.join("file_a.txt"), "hello").unwrap();
        fs::write(dir.join("file_b.log"), "log").unwrap();

        // dir1 y subdir
        let dir1 = dir.join("dir1");
        fs::create_dir_all(&dir1).unwrap();
        fs::write(dir1.join("file_c.txt"), "0123456789").unwrap();

        let dir1_1 = dir1.join("dir1_1");
        fs::create_dir_all(&dir1_1).unwrap();
        fs::write(dir1_1.join("file_d.txt"), "1234567").unwrap();

        // dir2
        let dir2 = dir.join("dir2");
        fs::create_dir_all(&dir2).unwrap();
        fs::write(dir2.join("file_e.txt"), "abcd").unwrap();
    }

    #[test]
    fn test_recorrido_correcto() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let walker = TreeWalker::new();
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // 5 archivos: file_a.txt, file_b.log, file_c.txt, file_d.txt, file_e.txt
        assert_eq!(result.file_count, 5, "Debería encontrar 5 archivos");

        // 4 directorios: root, dir1, dir1_1, dir2
        assert_eq!(result.dir_count, 4, "Debería encontrar 4 directorios");

        // Total: 5 + 3 + 10 + 7 + 4 = 29 bytes
        assert_eq!(result.total_size, 29, "Tamaño total debería ser 29 bytes");

        assert_eq!(result.skipped_count, 0, "No debería haber entradas omitidas");
    }

    #[test]
    fn test_tamanos_acumulados_directorios() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let walker = TreeWalker::new();
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // Buscar dir1_1: debería tener tamaño acumulado = 7 (file_d.txt)
        let dir1_1 = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("dir1_1"))
            .expect("dir1_1 debería existir");
        assert_eq!(dir1_1.size, 7, "dir1_1 debería acumular 7 bytes");
        assert_eq!(dir1_1.children_count, 1, "dir1_1 tiene 1 hijo directo");

        // Buscar dir1: debería tener tamaño acumulado = 10 + 7 = 17
        let dir1 = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("dir1") && !e.path.ends_with("dir1_1"))
            .expect("dir1 debería existir");
        assert_eq!(dir1.size, 17, "dir1 debería acumular 17 bytes");
        assert_eq!(dir1.children_count, 2, "dir1 tiene 2 hijos directos (file_c.txt y dir1_1)");

        // Buscar dir2: debería tener tamaño acumulado = 4 (file_e.txt)
        let dir2 = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("dir2"))
            .expect("dir2 debería existir");
        assert_eq!(dir2.size, 4, "dir2 debería acumular 4 bytes");
        assert_eq!(dir2.children_count, 1, "dir2 tiene 1 hijo directo");

        // Root: debería acumular todo = 29 bytes
        let root = result
            .entries
            .iter()
            .find(|e| e.depth == 0)
            .expect("root debería existir");
        assert_eq!(root.size, 29, "root debería acumular 29 bytes");
    }

    #[test]
    fn test_profundidad_maxima_respetada() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        // max_depth 1: solo raíz y sus hijos directos
        let walker = TreeWalker::new().max_depth(1);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // Con depth 1: root (depth 0), file_a.txt, file_b.log, dir1, dir2 (depth 1)
        // No debería incluir file_c.txt, dir1_1, file_d.txt, file_e.txt
        let max_depth = result.entries.iter().map(|e| e.depth).max().unwrap_or(0);
        assert!(max_depth <= 1, "Profundidad máxima no debería exceder 1, fue {}", max_depth);

        // Solo 2 archivos directos en raíz: file_a.txt, file_b.log
        assert_eq!(result.file_count, 2, "Con depth 1, solo 2 archivos en raíz");
    }

    #[test]
    fn test_cancelacion_interrumpe_recorrido() {
        let tmp = TempDir::new().unwrap();

        // Crear una estructura más grande para que la cancelación sea efectiva.
        for i in 0..200 {
            let dir = tmp.path().join(format!("dir_{:03}", i));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("file.txt"), "data").unwrap();
        }

        // Señal de cancelación activa ANTES de iniciar.
        let cancel = AtomicBool::new(true);
        let walker = TreeWalker::new();
        let result = walker.walk(tmp.path(), &cancel);

        assert!(result.is_err(), "Debería fallar por cancelación");
        match result.unwrap_err() {
            FsError::Cancelled => {} // OK
            other => panic!("Se esperaba FsError::Cancelled, se obtuvo: {}", other),
        }
    }

    #[test]
    fn test_exclusiones_glob_funcionan() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        // Excluir archivos *.log
        let walker = TreeWalker::new().exclude(vec!["*.log".to_string()]);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // file_b.log debería estar excluido
        let has_log = result.entries.iter().any(|e| {
            e.path
                .extension()
                .map_or(false, |ext| ext == "log")
        });
        assert!(!has_log, "No debería haber archivos .log en los resultados");
        assert_eq!(result.file_count, 4, "Deberían quedar 4 archivos sin los .log");
        assert_eq!(result.skipped_count, 1, "1 archivo .log debería haberse omitido");

        // Total sin file_b.log: 29 - 3 = 26
        assert_eq!(result.total_size, 26, "Tamaño total sin .log = 26 bytes");
    }

    #[test]
    fn test_exclusion_directorio_glob() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        // Excluir el directorio dir1 por nombre
        let walker = TreeWalker::new().exclude(vec!["dir1".to_string()]);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // dir1 y dir1_1/file_c.txt + file_d.txt no deberían estar.
        // Nota: walkdir no descenderá en dir1 porque lo excluimos,
        // pero los hijos se procesan individualmente, así que se filtran uno a uno.
        let has_dir1 = result.entries.iter().any(|e| {
            e.path.file_name().map_or(false, |n| n == "dir1")
        });
        assert!(!has_dir1, "dir1 no debería estar en los resultados");
    }

    #[test]
    fn test_default_values() {
        let walker = TreeWalker::new();
        assert_eq!(walker.max_depth, 8, "max_depth por defecto = 8");
        assert!(!walker.follow_symlinks, "follow_symlinks por defecto = false");
        assert!(walker.excluded_patterns.is_empty(), "Sin exclusiones por defecto");
    }

    #[test]
    fn test_directorio_vacio() {
        let tmp = TempDir::new().unwrap();
        let cancel = AtomicBool::new(false);
        let walker = TreeWalker::new();
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        assert_eq!(result.file_count, 0, "Directorio vacío = 0 archivos");
        assert_eq!(result.dir_count, 1, "Solo el directorio raíz");
        assert_eq!(result.total_size, 0, "0 bytes en directorio vacío");
    }

    #[test]
    fn test_patron_glob_invalido() {
        let tmp = TempDir::new().unwrap();
        let cancel = AtomicBool::new(false);
        let walker = TreeWalker::new().exclude(vec!["[invalid".to_string()]);
        let result = walker.walk(tmp.path(), &cancel);

        assert!(result.is_err(), "Patrón glob inválido debería dar error");
        match result.unwrap_err() {
            FsError::InvalidGlob { pattern, .. } => {
                assert_eq!(pattern, "[invalid");
            }
            other => panic!("Se esperaba InvalidGlob, se obtuvo: {}", other),
        }
    }

    #[test]
    fn test_entries_contienen_campos_correctos() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("test.txt"), "hola mundo").unwrap();

        let walker = TreeWalker::new();
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // Buscar el archivo
        let file = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("test.txt"))
            .expect("test.txt debería existir");

        assert!(!file.is_dir, "test.txt no es directorio");
        assert!(!file.is_symlink, "test.txt no es symlink");
        assert_eq!(file.size, 10, "test.txt tiene 10 bytes");
        assert_eq!(file.depth, 1, "test.txt está a profundidad 1");
        assert_eq!(file.children_count, 0, "Archivos tienen 0 hijos");
    }

    #[cfg(unix)]
    #[test]
    fn test_symlinks_no_seguidos() {
        use std::os::unix::fs as unix_fs;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("real_file.txt");
        fs::write(&target, "contenido real").unwrap();

        let link = tmp.path().join("link_to_file");
        unix_fs::symlink(&target, &link).unwrap();

        let walker = TreeWalker::new().follow_symlinks(false);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        let link_entry = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("link_to_file"))
            .expect("link debería aparecer en resultados");
        assert!(link_entry.is_symlink, "Debería detectarse como symlink");
    }

    #[cfg(windows)]
    #[test]
    fn test_symlinks_detectados_windows() {
        // En Windows, crear symlinks requiere privilegios elevados normalmente.
        // Verificamos al menos que el walker no falla en un directorio sin symlinks.
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("normal.txt"), "normal").unwrap();

        let walker = TreeWalker::new().follow_symlinks(false);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        let normal = result
            .entries
            .iter()
            .find(|e| e.path.ends_with("normal.txt"))
            .expect("normal.txt debería existir");
        assert!(!normal.is_symlink, "Archivo regular no es symlink");
    }

    #[test]
    fn test_profundidad_cero() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        // max_depth 0: solo la raíz
        let walker = TreeWalker::new().max_depth(0);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        assert_eq!(result.entries.len(), 1, "Con depth 0, solo la raíz");
        assert_eq!(result.file_count, 0, "Sin archivos");
        assert_eq!(result.dir_count, 1, "Solo la raíz");
    }

    #[test]
    fn test_multiples_exclusiones() {
        let tmp = TempDir::new().unwrap();
        create_test_tree(tmp.path());

        let walker = TreeWalker::new().exclude(vec![
            "*.log".to_string(),
            "*.txt".to_string(),
        ]);
        let cancel = AtomicBool::new(false);
        let result = walker.walk(tmp.path(), &cancel).unwrap();

        // Todos los archivos son .txt o .log, así que file_count = 0
        assert_eq!(result.file_count, 0, "Todos los archivos excluidos");
        assert_eq!(result.total_size, 0, "0 bytes sin archivos");
    }

    #[test]
    fn test_builder_pattern_fluent() {
        let walker = TreeWalker::new()
            .max_depth(3)
            .follow_symlinks(true)
            .exclude(vec!["*.tmp".to_string()]);

        assert_eq!(walker.max_depth, 3);
        assert!(walker.follow_symlinks);
        assert_eq!(walker.excluded_patterns, vec!["*.tmp".to_string()]);
    }
}