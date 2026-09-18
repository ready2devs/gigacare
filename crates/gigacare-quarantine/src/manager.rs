//! Gestor de cuarentena para GigaCare.
//!
//! Controla el ciclo de vida de los archivos: aislamiento seguro, preservacion de
//! rutas originales, validacion de integridad SHA-256, limites de espacio y purga automatica.

use std::path::{Path, PathBuf};
use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::error::{QuarantineError, Result};
use crate::models::{
    QuarantineEntry, QuarantineFilters, QuarantineManifest, QuarantineStats, QuarantineStatus,
};

/// Limite por defecto de espacio de cuarentena: 5 GB.
pub const DEFAULT_MAX_SPACE_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// Dias de retencion por defecto: 7 dias.
pub const DEFAULT_RETENTION_DAYS: u32 = 7;

/// Rango valido para dias de retencion (1 a 90 dias).
pub const MIN_RETENTION_DAYS: u32 = 1;
pub const MAX_RETENTION_DAYS: u32 = 90;

/// Mueve un archivo de forma segura entre particiones/filesystems si rename falla.
fn move_file_cross_fs(src: &Path, dst: &Path) -> std::io::Result<()> {
    if std::fs::rename(src, dst).is_err() {
        std::fs::copy(src, dst)?;
        std::fs::remove_file(src)?;
    }
    Ok(())
}

/// Gestor principal del almacenamiento y ciclo de vida de la cuarentena.
pub struct QuarantineManager {
    base_dir: PathBuf,
    manifest_path: PathBuf,
    files_dir: PathBuf,
    manifest: QuarantineManifest,
    retention_days: u32,
    max_space_bytes: u64,
}

impl QuarantineManager {
    /// Crea un nuevo QuarantineManager en el directorio base especificado.
    pub fn new(base_dir: PathBuf, retention_days: u32, max_space_bytes: u64) -> Result<Self> {
        if !(MIN_RETENTION_DAYS..=MAX_RETENTION_DAYS).contains(&retention_days) {
            return Err(QuarantineError::InvalidRetentionDays(retention_days));
        }

        std::fs::create_dir_all(&base_dir)?;
        let manifest_path = base_dir.join("manifest.json");
        let files_dir = base_dir.join("files");
        std::fs::create_dir_all(&files_dir)?;

        let manifest = if manifest_path.exists() {
            let content = std::fs::read_to_string(&manifest_path)?;
            serde_json::from_str(&content)?
        } else {
            let default_manifest = QuarantineManifest::default();
            let json = serde_json::to_string_pretty(&default_manifest)?;
            std::fs::write(&manifest_path, json)?;
            default_manifest
        };

        Ok(Self {
            base_dir,
            manifest_path,
            files_dir,
            manifest,
            retention_days,
            max_space_bytes,
        })
    }

    /// Inicializa el QuarantineManager con configuraciones por defecto (7 dias, 5 GB).
    pub fn with_defaults(base_dir: PathBuf) -> Result<Self> {
        Self::new(base_dir, DEFAULT_RETENTION_DAYS, DEFAULT_MAX_SPACE_BYTES)
    }

    /// Retorna la ruta al directorio base de la cuarentena.
    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    /// Retorna los dias de retencion configurados.
    pub fn retention_days(&self) -> u32 {
        self.retention_days
    }

    /// Actualiza los dias de retencion configurados (1..=90).
    pub fn set_retention_days(&mut self, days: u32) -> Result<()> {
        if !(MIN_RETENTION_DAYS..=MAX_RETENTION_DAYS).contains(&days) {
            return Err(QuarantineError::InvalidRetentionDays(days));
        }
        self.retention_days = days;
        Ok(())
    }

    /// Retorna el limite de espacio en bytes configurado.
    pub fn max_space_bytes(&self) -> u64 {
        self.max_space_bytes
    }

    /// Actualiza el limite de espacio en bytes.
    pub fn set_max_space_bytes(&mut self, bytes: u64) {
        self.max_space_bytes = bytes;
    }

    /// Retorna una referencia al manifiesto en memoria.
    pub fn manifest(&self) -> &QuarantineManifest {
        &self.manifest
    }

    /// Guarda el manifiesto en disco de manera atomica.
    fn save_manifest(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.manifest)?;
        let tmp_path = self.base_dir.join("manifest.json.tmp");
        std::fs::write(&tmp_path, json)?;
        std::fs::rename(&tmp_path, &self.manifest_path)?;
        Ok(())
    }

    /// Mueve un archivo a cuarentena, calculando su SHA-256 y registrandolo en el manifiesto.
    pub fn quarantine_file(
        &mut self,
        original_path: &Path,
        source_module: &str,
    ) -> Result<QuarantineEntry> {
        if !original_path.is_file() {
            return Err(QuarantineError::FileNotFound(original_path.to_path_buf()));
        }

        let metadata = original_path.metadata()?;
        let size_bytes = metadata.len();

        let current_bytes: u64 = self
            .manifest
            .entries
            .iter()
            .filter(|e| e.status == QuarantineStatus::Quarantined)
            .map(|e| e.size_bytes)
            .sum();

        if current_bytes.saturating_add(size_bytes) > self.max_space_bytes {
            return Err(QuarantineError::SpaceLimitExceeded {
                current_bytes,
                required_bytes: size_bytes,
                limit_bytes: self.max_space_bytes,
            });
        }

        let sha256 = gigacare_hash::sha256_file(original_path)?;
        let id = Uuid::new_v4().to_string();

        let file_name = original_path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "file.dat".to_string());

        let entry_dir = self.files_dir.join(&id);
        std::fs::create_dir_all(&entry_dir)?;
        let target_path = entry_dir.join(&file_name);

        move_file_cross_fs(original_path, &target_path)?;

        let now = Utc::now();
        let expires_at = now + Duration::days(self.retention_days as i64);

        let entry = QuarantineEntry {
            id,
            original_path: original_path.to_string_lossy().to_string(),
            quarantine_path: target_path.to_string_lossy().to_string(),
            sha256,
            size_bytes,
            quarantined_at: now,
            expires_at,
            source_module: source_module.to_string(),
            status: QuarantineStatus::Quarantined,
        };

        self.manifest.entries.push(entry.clone());
        self.save_manifest()?;

        Ok(entry)
    }

    /// Restaura un archivo en cuarentena comprobando integridad SHA-256.
    pub fn restore_file(&mut self, id: &str) -> Result<PathBuf> {
        let idx = self
            .manifest
            .entries
            .iter()
            .position(|e| e.id == id)
            .ok_or_else(|| QuarantineError::NotFound(id.to_string()))?;

        let entry = &self.manifest.entries[idx];
        if entry.status != QuarantineStatus::Quarantined {
            return Err(QuarantineError::InvalidState {
                id: id.to_string(),
                status: entry.status,
            });
        }

        let q_path = PathBuf::from(&entry.quarantine_path);
        if !q_path.is_file() {
            return Err(QuarantineError::FileNotFound(q_path));
        }

        let actual_hash = gigacare_hash::sha256_file(&q_path)?;
        if actual_hash != entry.sha256 {
            return Err(QuarantineError::IntegrityMismatch {
                id: id.to_string(),
                expected: entry.sha256.clone(),
                actual: actual_hash,
            });
        }

        let original_path = PathBuf::from(&entry.original_path);

        if original_path.exists() {
            return Err(QuarantineError::TargetAlreadyExists(original_path));
        }

        if let Some(parent) = original_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        move_file_cross_fs(&q_path, &original_path)?;

        if let Some(parent) = q_path.parent() {
            let _ = std::fs::remove_dir(parent);
        }

        self.manifest.entries[idx].status = QuarantineStatus::Restored;
        self.save_manifest()?;

        Ok(original_path)
    }

    /// Purga automaticamente archivos expirados (AC-012).
    pub fn purge_expired(&mut self) -> Result<Vec<String>> {
        self.purge_expired_at(Utc::now())
    }

    /// Purga archivos expirados segun un instante dado (util para testing).
    pub fn purge_expired_at(&mut self, now: DateTime<Utc>) -> Result<Vec<String>> {
        let mut purged_ids = Vec::new();

        for entry in &self.manifest.entries {
            if entry.status == QuarantineStatus::Quarantined && entry.expires_at <= now {
                let q_path = PathBuf::from(&entry.quarantine_path);
                if q_path.exists() {
                    let _ = std::fs::remove_file(&q_path);
                }
                if let Some(parent) = q_path.parent() {
                    let _ = std::fs::remove_dir(parent);
                }
                purged_ids.push(entry.id.clone());
            }
        }

        if !purged_ids.is_empty() {
            self.manifest
                .entries
                .retain(|entry| !purged_ids.contains(&entry.id));
            self.save_manifest()?;
        }

        Ok(purged_ids)
    }

    /// Elimina permanentemente una entrada de cuarentena de forma manual.
    pub fn purge_entry(&mut self, id: &str) -> Result<()> {
        let idx = self
            .manifest
            .entries
            .iter()
            .position(|e| e.id == id)
            .ok_or_else(|| QuarantineError::NotFound(id.to_string()))?;

        let entry = &self.manifest.entries[idx];
        let q_path = PathBuf::from(&entry.quarantine_path);
        if q_path.exists() {
            let _ = std::fs::remove_file(&q_path);
        }
        if let Some(parent) = q_path.parent() {
            let _ = std::fs::remove_dir(parent);
        }

        self.manifest.entries.remove(idx);
        self.save_manifest()?;
        Ok(())
    }

    /// Lista entradas segun los filtros especificados.
    pub fn list_entries(&self, filters: Option<&QuarantineFilters>) -> Vec<QuarantineEntry> {
        let filters = match filters {
            Some(f) => f,
            None => {
                return self
                    .manifest
                    .entries
                    .iter()
                    .filter(|e| e.status == QuarantineStatus::Quarantined)
                    .cloned()
                    .collect();
            }
        };

        self.manifest
            .entries
            .iter()
            .filter(|entry| {
                if let Some(target_status) = filters.status {
                    if entry.status != target_status {
                        return false;
                    }
                } else if entry.status != QuarantineStatus::Quarantined {
                    return false;
                }

                if let Some(ref module) = filters.source_module {
                    if &entry.source_module != module {
                        return false;
                    }
                }

                if let Some(ref query) = filters.search_query {
                    let q = query.to_lowercase();
                    let matches_path = entry.original_path.to_lowercase().contains(&q);
                    let matches_id = entry.id.to_lowercase().contains(&q);
                    if !matches_path && !matches_id {
                        return false;
                    }
                }

                true
            })
            .cloned()
            .collect()
    }

    /// Retorna una entrada especifica por su ID.
    pub fn get_entry(&self, id: &str) -> Option<&QuarantineEntry> {
        self.manifest.entries.iter().find(|e| e.id == id)
    }

    /// Calcula las estadisticas actuales de la cuarentena.
    pub fn stats(&self) -> QuarantineStats {
        let active: Vec<&QuarantineEntry> = self
            .manifest
            .entries
            .iter()
            .filter(|e| e.status == QuarantineStatus::Quarantined)
            .collect();

        let total_items = active.len() as u64;
        let total_bytes = active.iter().map(|e| e.size_bytes).sum();
        let oldest_quarantined_at = active.iter().map(|e| e.quarantined_at).min();

        QuarantineStats {
            total_items,
            total_bytes,
            max_space_bytes: self.max_space_bytes,
            oldest_quarantined_at,
        }
    }
}
