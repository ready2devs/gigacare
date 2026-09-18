//! # gigacare-quarantine
//!
//! Crate para el aislamiento reversible de archivos seleccionados para eliminacion.
//! Implementa QuarantineManifest v1, verificacion de integridad SHA-256,
//! limites de espacio de almacenamiento, purga automatica y recreacion de directorios.

pub mod error;
pub mod manager;
pub mod models;

pub use error::{QuarantineError, Result};
pub use manager::{
    QuarantineManager, DEFAULT_MAX_SPACE_BYTES, DEFAULT_RETENTION_DAYS, MAX_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
};
pub use models::{
    QuarantineEntry, QuarantineFilters, QuarantineManifest, QuarantineStats, QuarantineStatus,
};

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_quarantine_cycle_move_and_restore() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let original_file = work_dir.join("test_document.txt");
        let content = b"Hola mundo GigaCare Cuarentena reversible!";
        fs::write(&original_file, content).unwrap();
        let expected_sha256 = gigacare_hash::sha256_bytes(content);

        let mut manager = QuarantineManager::with_defaults(q_dir.clone()).unwrap();
        assert_eq!(manager.manifest().version, 1);

        // Mover a cuarentena
        let entry = manager
            .quarantine_file(&original_file, "system_cleaner")
            .unwrap();

        assert_eq!(entry.status, QuarantineStatus::Quarantined);
        assert_eq!(entry.sha256, expected_sha256);
        assert_eq!(entry.size_bytes, content.len() as u64);
        assert_eq!(entry.source_module, "system_cleaner");
        assert!(!original_file.exists(), "El archivo original debe haber sido movido");
        assert!(fs::metadata(&entry.quarantine_path).is_ok());

        // Verificar stats
        let stats = manager.stats();
        assert_eq!(stats.total_items, 1);
        assert_eq!(stats.total_bytes, content.len() as u64);

        // Restaurar
        let restored_path = manager.restore_file(&entry.id).unwrap();
        assert_eq!(restored_path, original_file);
        assert!(original_file.exists());
        assert_eq!(fs::read(&original_file).unwrap(), content);

        // SHA-256 post-restauracion coincide exactamente
        let restored_sha256 = gigacare_hash::sha256_file(&original_file).unwrap();
        assert_eq!(restored_sha256, expected_sha256);

        // El estado en manifest debe ser Restored
        let updated_entry = manager.get_entry(&entry.id).unwrap();
        assert_eq!(updated_entry.status, QuarantineStatus::Restored);

        // Stats ahora deben reflejar 0 activos
        assert_eq!(manager.stats().total_items, 0);
    }

    #[test]
    fn test_restore_recreates_deleted_directory() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let deep_dir = tmp.path().join("a").join("b").join("c");
        fs::create_dir_all(&deep_dir).unwrap();

        let original_file = deep_dir.join("nested.txt");
        fs::write(&original_file, b"subdirectorio profundo").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        let entry = manager.quarantine_file(&original_file, "dev_deps").unwrap();

        // Eliminar completamente el arbol de directorios original (CB-006)
        fs::remove_dir_all(tmp.path().join("a")).unwrap();
        assert!(!deep_dir.exists());

        // Restaurar debe recrear el arbol automaticamente
        let restored_path = manager.restore_file(&entry.id).unwrap();
        assert_eq!(restored_path, original_file);
        assert!(original_file.exists());
        assert_eq!(fs::read(&original_file).unwrap(), b"subdirectorio profundo");
    }

    #[test]
    fn test_restore_fails_on_integrity_mismatch() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let original_file = work_dir.join("important.txt");
        fs::write(&original_file, b"contenido original").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        let entry = manager.quarantine_file(&original_file, "test").unwrap();

        // Corromper el archivo en cuarentena simulando alteracion de datos
        fs::write(&entry.quarantine_path, b"contenido adulterado").unwrap();

        // Restaurar debe fallar por IntegrityMismatch
        let res = manager.restore_file(&entry.id);
        assert!(res.is_err());
        match res.unwrap_err() {
            QuarantineError::IntegrityMismatch { expected, actual, .. } => {
                assert_ne!(expected, actual);
            }
            other => panic!("Esperaba IntegrityMismatch pero obtuve: {:?}", other),
        }
    }

    #[test]
    fn test_space_limit_blocks_operation() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        // Limite pequeno de 100 bytes
        let mut manager = QuarantineManager::new(q_dir, 7, 100).unwrap();

        let big_file = work_dir.join("large.bin");
        fs::write(&big_file, vec![0u8; 150]).unwrap();

        let res = manager.quarantine_file(&big_file, "test");
        assert!(res.is_err());
        match res.unwrap_err() {
            QuarantineError::SpaceLimitExceeded {
                current_bytes,
                required_bytes,
                limit_bytes,
            } => {
                assert_eq!(current_bytes, 0);
                assert_eq!(required_bytes, 150);
                assert_eq!(limit_bytes, 100);
            }
            other => panic!("Esperaba SpaceLimitExceeded pero obtuve: {:?}", other),
        }

        // El archivo original no debe haberse tocado
        assert!(big_file.exists());
    }

    #[test]
    fn test_auto_purge_expired_removes_entry_and_file() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let f1 = work_dir.join("file1.txt");
        fs::write(&f1, b"antiguo").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir.clone()).unwrap();
        let entry = manager.quarantine_file(&f1, "messaging_cache").unwrap();

        // Simular que han pasado 8 dias (AC-012: duracion 7 dias)
        let simulated_now = Utc::now() + Duration::days(8);

        let purged = manager.purge_expired_at(simulated_now).unwrap();
        assert_eq!(purged.len(), 1);
        assert_eq!(purged[0], entry.id);

        // Archivo fisico en cuarentena no debe existir
        assert!(!fs::metadata(&entry.quarantine_path).is_ok());

        // Su entrada debe haber desaparecido del manifiesto (AC-012)
        assert!(manager.get_entry(&entry.id).is_none());
        assert_eq!(manager.manifest().entries.len(), 0);

        // Reabrir manager para verificar persistencia en disco
        let manager_reloaded = QuarantineManager::with_defaults(q_dir).unwrap();
        assert_eq!(manager_reloaded.manifest().entries.len(), 0);
    }

    #[test]
    fn test_purge_manual_entry() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let f = work_dir.join("manual.txt");
        fs::write(&f, b"manual purge").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        let entry = manager.quarantine_file(&f, "test").unwrap();

        manager.purge_entry(&entry.id).unwrap();
        assert!(!fs::metadata(&entry.quarantine_path).is_ok());
        assert!(manager.get_entry(&entry.id).is_none());
    }

    #[test]
    fn test_list_entries_filtering() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let f1 = work_dir.join("photo_1.jpg");
        let f2 = work_dir.join("photo_2.jpg");
        let f3 = work_dir.join("cache.tmp");
        fs::write(&f1, b"1").unwrap();
        fs::write(&f2, b"2").unwrap();
        fs::write(&f3, b"3").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        manager.quarantine_file(&f1, "photo_curator").unwrap();
        manager.quarantine_file(&f2, "photo_curator").unwrap();
        manager.quarantine_file(&f3, "system_cleaner").unwrap();

        // Filtro por modulo
        let photo_entries = manager.list_entries(Some(&QuarantineFilters {
            source_module: Some("photo_curator".to_string()),
            search_query: None,
            status: None,
        }));
        assert_eq!(photo_entries.len(), 2);

        // Filtro por busqueda de texto
        let search_entries = manager.list_entries(Some(&QuarantineFilters {
            source_module: None,
            search_query: Some("photo_1".to_string()),
            status: None,
        }));
        assert_eq!(search_entries.len(), 1);
        assert!(search_entries[0].original_path.contains("photo_1.jpg"));

        // Listar sin filtro
        assert_eq!(manager.list_entries(None).len(), 3);
    }

    #[test]
    fn test_retention_days_validation() {
        let tmp = tempdir().unwrap();
        assert!(QuarantineManager::new(tmp.path().join("q1"), 0, 1000).is_err());
        assert!(QuarantineManager::new(tmp.path().join("q2"), 91, 1000).is_err());
        assert!(QuarantineManager::new(tmp.path().join("q3"), 1, 1000).is_ok());
        assert!(QuarantineManager::new(tmp.path().join("q4"), 90, 1000).is_ok());

        let mut manager = QuarantineManager::new(tmp.path().join("q5"), 7, 1000).unwrap();
        assert!(manager.set_retention_days(0).is_err());
        assert!(manager.set_retention_days(91).is_err());
        assert!(manager.set_retention_days(30).is_ok());
        assert_eq!(manager.retention_days(), 30);
    }

    #[test]
    fn test_restore_fails_when_target_already_exists() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let f = work_dir.join("collide.txt");
        fs::write(&f, b"original").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        let entry = manager.quarantine_file(&f, "test").unwrap();

        // Volver a crear un archivo en la ruta original
        fs::write(&f, b"nuevo conflicto").unwrap();

        let res = manager.restore_file(&entry.id);
        assert!(res.is_err());
        match res.unwrap_err() {
            QuarantineError::TargetAlreadyExists(path) => {
                assert_eq!(path, f);
            }
            other => panic!("Esperaba TargetAlreadyExists pero obtuve: {:?}", other),
        }
    }

    #[test]
    fn test_models_display_and_serialization() {
        assert_eq!(format!("{}", QuarantineStatus::Quarantined), "quarantined");
        assert_eq!(format!("{}", QuarantineStatus::Restored), "restored");
        assert_eq!(format!("{}", QuarantineStatus::Purged), "purged");

        let entry = QuarantineEntry {
            id: "test-id-123".to_string(),
            original_path: "/tmp/original.txt".to_string(),
            quarantine_path: "/tmp/q/original.txt".to_string(),
            sha256: "abc123hash".to_string(),
            size_bytes: 42,
            quarantined_at: Utc::now(),
            expires_at: Utc::now() + Duration::days(7),
            source_module: "test".to_string(),
            status: QuarantineStatus::Quarantined,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("quarantined"));
        assert!(json.contains("test-id-123"));

        let deserialized: QuarantineEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, entry);
    }

    #[test]
    fn test_list_entries_by_id_search_and_status() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let f1 = work_dir.join("a.txt");
        fs::write(&f1, b"aaa").unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        let entry1 = manager.quarantine_file(&f1, "module_a").unwrap();

        // Buscar por id
        let by_id = manager.list_entries(Some(&QuarantineFilters {
            source_module: None,
            search_query: Some(entry1.id.clone()),
            status: Some(QuarantineStatus::Quarantined),
        }));
        assert_eq!(by_id.len(), 1);
        assert_eq!(by_id[0].id, entry1.id);

        // Buscar con status Restored (debe dar vacío)
        let restored_list = manager.list_entries(Some(&QuarantineFilters {
            source_module: None,
            search_query: None,
            status: Some(QuarantineStatus::Restored),
        }));
        assert_eq!(restored_list.len(), 0);
    }

    #[test]
    fn test_invalid_state_and_not_found_errors() {
        let tmp = tempdir().unwrap();
        let q_dir = tmp.path().join("quarantine");
        let work_dir = tmp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let mut manager = QuarantineManager::with_defaults(q_dir).unwrap();
        assert!(manager.restore_file("inexistente").is_err());
        assert!(manager.purge_entry("inexistente").is_err());

        let f = work_dir.join("doc.txt");
        fs::write(&f, b"contenido").unwrap();
        let entry = manager.quarantine_file(&f, "test").unwrap();
        manager.restore_file(&entry.id).unwrap();

        // Intentar restaurar de nuevo debe dar InvalidState
        let res = manager.restore_file(&entry.id);
        assert!(res.is_err());
        match res.unwrap_err() {
            QuarantineError::InvalidState { status, .. } => {
                assert_eq!(status, QuarantineStatus::Restored);
            }
            other => panic!("Esperaba InvalidState: {:?}", other),
        }
    }
}
