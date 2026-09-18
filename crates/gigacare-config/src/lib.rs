//! # gigacare-config
//!
//! Gestión de configuración para GigaCare. Provee `AppConfig` con
//! serialización JSON, valores por defecto, load/save a disco, merge parcial,
//! export/import roundtrip y validación de campos.

use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

// ─────────────────────────── Errors ───────────────────────────

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Error de I/O: {0}")]
    Io(#[from] std::io::Error),

    #[error("Error de JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Validación fallida: {0}")]
    Validation(String),
}

pub type Result<T> = std::result::Result<T, ConfigError>;

// ─────────────────────────── Enums ────────────────────────────

/// Nivel de licencia del usuario.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LicenseTier {
    #[default]
    Free,
    Byok,
    Pro,
}

/// Frecuencia de escaneo.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Schedule {
    Daily,
    #[default]
    Weekly,
    Monthly,
    Manual,
}

/// Tema visual de la UI.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    Dark,
    Light,
    System,
}

// ─────────────────────────── Sub-structs ──────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuarantineConfig {
    pub retention_days: u32,
    pub max_size_gb: f64,
}

impl Default for QuarantineConfig {
    fn default() -> Self {
        Self {
            retention_days: 7,
            max_size_gb: 5.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScanningConfig {
    pub dev_inactive_threshold_days: u32,
    pub temp_min_age_days: u32,
    pub schedule: Schedule,
    pub schedule_time: String,
    pub excluded_paths: Vec<String>,
}

impl Default for ScanningConfig {
    fn default() -> Self {
        Self {
            dev_inactive_threshold_days: 90,
            temp_min_age_days: 1,
            schedule: Schedule::default(),
            schedule_time: "03:00".to_string(),
            excluded_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PhotosConfig {
    pub keep_count: u32,
    pub phash_threshold: u32,
    pub thumbnail_max_px: u32,
    pub thumbnail_quality: u32,
    pub thumbnail_max_kb: u32,
}

impl Default for PhotosConfig {
    fn default() -> Self {
        Self {
            keep_count: 1,
            phash_threshold: 8,
            thumbnail_max_px: 512,
            thumbnail_quality: 60,
            thumbnail_max_kb: 100,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiRateLimits {
    pub google_ai_studio: u32,
    pub freellmapi: u32,
    pub ollama: u32,
}

impl Default for AiRateLimits {
    fn default() -> Self {
        Self {
            google_ai_studio: 10,
            freellmapi: 30,
            ollama: 0,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AiByokKeys {
    pub google_ai_studio: Option<String>,
    pub ollama_endpoint: Option<String>,
    pub ollama_model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AiProvidersConfig {
    pub enabled: Vec<String>,
    pub priority_order: Vec<String>,
    pub rate_limits: AiRateLimits,
    pub byok_keys: AiByokKeys,
}

impl Default for AiProvidersConfig {
    fn default() -> Self {
        let providers = vec![
            "google_ai_studio".to_string(),
            "freellmapi".to_string(),
            "ollama".to_string(),
        ];
        Self {
            enabled: providers.clone(),
            priority_order: providers,
            rate_limits: AiRateLimits::default(),
            byok_keys: AiByokKeys::default(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LicenseConfig {
    pub tier: LicenseTier,
    pub token: Option<String>,
    pub validated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UninstallerConfig {
    pub scan_residuals_after_uninstall: bool,
    pub uninstaller_timeout_sec: u32,
    pub known_footprints_version: String,
}

impl Default for UninstallerConfig {
    fn default() -> Self {
        Self {
            scan_residuals_after_uninstall: true,
            uninstaller_timeout_sec: 30,
            known_footprints_version: "1.0.0".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StartupManagerConfig {
    pub protected_services_whitelist_version: String,
    pub show_system_services: bool,
}

impl Default for StartupManagerConfig {
    fn default() -> Self {
        Self {
            protected_services_whitelist_version: "1.0.0".to_string(),
            show_system_services: false,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct AndroidConfig {
    pub shizuku_enabled: bool,
    pub root_enabled: bool,
    pub saf_granted_uris: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiConfig {
    pub preview_min_size_mb: u32,
    pub theme: Theme,
    pub language: String,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            preview_min_size_mb: 50,
            theme: Theme::default(),
            language: "es".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct I18nConfig {
    pub available_locales: Vec<String>,
    pub fallback_locale: String,
}

impl Default for I18nConfig {
    fn default() -> Self {
        Self {
            available_locales: vec!["es".to_string(), "en".to_string()],
            fallback_locale: "en".to_string(),
        }
    }
}

// ─────────────────────────── AppConfig ────────────────────────

/// Configuración principal de la aplicación GigaCare.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    pub quarantine: QuarantineConfig,
    pub scanning: ScanningConfig,
    pub photos: PhotosConfig,
    pub ai_providers: AiProvidersConfig,
    pub license: LicenseConfig,
    pub uninstaller: UninstallerConfig,
    pub startup_manager: StartupManagerConfig,
    pub android: AndroidConfig,
    pub ui: UiConfig,
    pub i18n: I18nConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            quarantine: QuarantineConfig::default(),
            scanning: ScanningConfig::default(),
            photos: PhotosConfig::default(),
            ai_providers: AiProvidersConfig::default(),
            license: LicenseConfig::default(),
            uninstaller: UninstallerConfig::default(),
            startup_manager: StartupManagerConfig::default(),
            android: AndroidConfig::default(),
            ui: UiConfig::default(),
            i18n: I18nConfig::default(),
        }
    }
}

impl AppConfig {
    /// Carga la configuración desde un archivo JSON. Si el archivo no existe,
    /// retorna la configuración por defecto.
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = std::fs::read_to_string(path)?;
        let config: Self = serde_json::from_str(&content)?;
        config.validate()?;
        Ok(config)
    }

    /// Guarda la configuración en un archivo JSON con formato legible.
    pub fn save(&self, path: &Path) -> Result<()> {
        self.validate()?;
        let json = serde_json::to_string_pretty(self)?;
        // Crear directorios padre si no existen
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Aplica un merge parcial: toma un `serde_json::Value` y lo mezcla
    /// sobre la configuración actual. Los campos no presentes en el JSON
    /// parcial se mantienen con sus valores actuales.
    pub fn merge_partial(&mut self, partial: &serde_json::Value) -> Result<()> {
        let base = serde_json::to_value(&*self)?;
        let merged = deep_merge(base, partial.clone());
        let new_config: AppConfig = serde_json::from_value(merged)?;
        new_config.validate()?;
        *self = new_config;
        Ok(())
    }

    /// Exporta la configuración como string JSON con formato legible.
    pub fn export_config(&self) -> Result<String> {
        let json = serde_json::to_string_pretty(self)?;
        Ok(json)
    }

    /// Importa una configuración desde un string JSON.
    pub fn import_config(json: &str) -> Result<Self> {
        let config: Self = serde_json::from_str(json)?;
        config.validate()?;
        Ok(config)
    }

    /// Valida que todos los campos estén dentro de rangos aceptables.
    pub fn validate(&self) -> Result<()> {
        // version debe ser 1
        if self.version != 1 {
            return Err(ConfigError::Validation(format!(
                "version debe ser 1, se encontró {}",
                self.version
            )));
        }

        // quarantine.retention_days: 1..=90
        if self.quarantine.retention_days < 1 || self.quarantine.retention_days > 90 {
            return Err(ConfigError::Validation(format!(
                "quarantine.retention_days debe estar entre 1 y 90, se encontró {}",
                self.quarantine.retention_days
            )));
        }

        // quarantine.max_size_gb: > 0
        if self.quarantine.max_size_gb <= 0.0 {
            return Err(ConfigError::Validation(
                "quarantine.max_size_gb debe ser mayor a 0".to_string(),
            ));
        }

        // scanning.dev_inactive_threshold_days: 1..=365
        if self.scanning.dev_inactive_threshold_days < 1
            || self.scanning.dev_inactive_threshold_days > 365
        {
            return Err(ConfigError::Validation(format!(
                "scanning.dev_inactive_threshold_days debe estar entre 1 y 365, se encontró {}",
                self.scanning.dev_inactive_threshold_days
            )));
        }

        // scanning.temp_min_age_days: 1..=365
        if self.scanning.temp_min_age_days < 1 || self.scanning.temp_min_age_days > 365 {
            return Err(ConfigError::Validation(format!(
                "scanning.temp_min_age_days debe estar entre 1 y 365, se encontró {}",
                self.scanning.temp_min_age_days
            )));
        }

        // scanning.schedule_time: formato HH:MM
        if !is_valid_time(&self.scanning.schedule_time) {
            return Err(ConfigError::Validation(format!(
                "scanning.schedule_time debe tener formato HH:MM, se encontró '{}'",
                self.scanning.schedule_time
            )));
        }

        // photos.keep_count: 1..=3
        if self.photos.keep_count < 1 || self.photos.keep_count > 3 {
            return Err(ConfigError::Validation(format!(
                "photos.keep_count debe estar entre 1 y 3, se encontró {}",
                self.photos.keep_count
            )));
        }

        // photos.phash_threshold: 1..=32
        if self.photos.phash_threshold < 1 || self.photos.phash_threshold > 32 {
            return Err(ConfigError::Validation(format!(
                "photos.phash_threshold debe estar entre 1 y 32, se encontró {}",
                self.photos.phash_threshold
            )));
        }

        // photos.thumbnail_max_px: 64..=2048
        if self.photos.thumbnail_max_px < 64 || self.photos.thumbnail_max_px > 2048 {
            return Err(ConfigError::Validation(format!(
                "photos.thumbnail_max_px debe estar entre 64 y 2048, se encontró {}",
                self.photos.thumbnail_max_px
            )));
        }

        // photos.thumbnail_quality: 1..=100
        if self.photos.thumbnail_quality < 1 || self.photos.thumbnail_quality > 100 {
            return Err(ConfigError::Validation(format!(
                "photos.thumbnail_quality debe estar entre 1 y 100, se encontró {}",
                self.photos.thumbnail_quality
            )));
        }

        // photos.thumbnail_max_kb: 1..=10000
        if self.photos.thumbnail_max_kb < 1 || self.photos.thumbnail_max_kb > 10000 {
            return Err(ConfigError::Validation(format!(
                "photos.thumbnail_max_kb debe estar entre 1 y 10000, se encontró {}",
                self.photos.thumbnail_max_kb
            )));
        }

        // uninstaller.uninstaller_timeout_sec: 5..=300
        if self.uninstaller.uninstaller_timeout_sec < 5
            || self.uninstaller.uninstaller_timeout_sec > 300
        {
            return Err(ConfigError::Validation(format!(
                "uninstaller.uninstaller_timeout_sec debe estar entre 5 y 300, se encontró {}",
                self.uninstaller.uninstaller_timeout_sec
            )));
        }

        // ui.preview_min_size_mb: 1..=1000
        if self.ui.preview_min_size_mb < 1 || self.ui.preview_min_size_mb > 1000 {
            return Err(ConfigError::Validation(format!(
                "ui.preview_min_size_mb debe estar entre 1 y 1000, se encontró {}",
                self.ui.preview_min_size_mb
            )));
        }

        // i18n.available_locales: no vacío
        if self.i18n.available_locales.is_empty() {
            return Err(ConfigError::Validation(
                "i18n.available_locales no puede estar vacío".to_string(),
            ));
        }

        // i18n.fallback_locale: no vacío
        if self.i18n.fallback_locale.is_empty() {
            return Err(ConfigError::Validation(
                "i18n.fallback_locale no puede estar vacío".to_string(),
            ));
        }

        Ok(())
    }
}

// ─────────────────────── Helpers privados ─────────────────────

/// Merge profundo de dos JSON Values. Los campos del `overlay` sobrescriben
/// a los de `base`. Objetos se fusionan recursivamente.
fn deep_merge(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
    use serde_json::Value;
    match (base, overlay) {
        (Value::Object(mut base_map), Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let merged = if let Some(base_val) = base_map.remove(&key) {
                    deep_merge(base_val, overlay_val)
                } else {
                    overlay_val
                };
                base_map.insert(key, merged);
            }
            Value::Object(base_map)
        }
        (_, overlay) => overlay,
    }
}

/// Valida que una cadena tenga formato HH:MM válido (00:00 - 23:59).
fn is_valid_time(s: &str) -> bool {
    if s.len() != 5 {
        return false;
    }
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return false;
    }
    let hour: u32 = match parts[0].parse() {
        Ok(h) => h,
        Err(_) => return false,
    };
    let minute: u32 = match parts[1].parse() {
        Ok(m) => m,
        Err(_) => return false,
    };
    hour <= 23 && minute <= 59
}

// ─────────────────────────── Tests ────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ── Test: Default tiene version == 1 ──
    #[test]
    fn test_default_version() {
        let config = AppConfig::default();
        assert_eq!(config.version, 1);
    }

    // ── Test: Default valida correctamente ──
    #[test]
    fn test_default_validates() {
        let config = AppConfig::default();
        assert!(config.validate().is_ok());
    }

    // ── Test: Valores default coinciden con el schema ──
    #[test]
    fn test_default_values_match_schema() {
        let config = AppConfig::default();

        // quarantine
        assert_eq!(config.quarantine.retention_days, 7);
        assert!((config.quarantine.max_size_gb - 5.0).abs() < f64::EPSILON);

        // scanning
        assert_eq!(config.scanning.dev_inactive_threshold_days, 90);
        assert_eq!(config.scanning.temp_min_age_days, 1);
        assert_eq!(config.scanning.schedule, Schedule::Weekly);
        assert_eq!(config.scanning.schedule_time, "03:00");
        assert!(config.scanning.excluded_paths.is_empty());

        // photos
        assert_eq!(config.photos.keep_count, 1);
        assert_eq!(config.photos.phash_threshold, 8);
        assert_eq!(config.photos.thumbnail_max_px, 512);
        assert_eq!(config.photos.thumbnail_quality, 60);
        assert_eq!(config.photos.thumbnail_max_kb, 100);

        // ai_providers
        assert_eq!(config.ai_providers.enabled, vec![
            "google_ai_studio", "freellmapi", "ollama"
        ]);
        assert_eq!(config.ai_providers.priority_order, vec![
            "google_ai_studio", "freellmapi", "ollama"
        ]);
        assert_eq!(config.ai_providers.rate_limits.google_ai_studio, 10);
        assert_eq!(config.ai_providers.rate_limits.freellmapi, 30);
        assert_eq!(config.ai_providers.rate_limits.ollama, 0);
        assert!(config.ai_providers.byok_keys.google_ai_studio.is_none());
        assert!(config.ai_providers.byok_keys.ollama_endpoint.is_none());
        assert!(config.ai_providers.byok_keys.ollama_model.is_none());

        // license
        assert_eq!(config.license.tier, LicenseTier::Free);
        assert!(config.license.token.is_none());
        assert!(config.license.validated_at.is_none());

        // uninstaller
        assert!(config.uninstaller.scan_residuals_after_uninstall);
        assert_eq!(config.uninstaller.uninstaller_timeout_sec, 30);
        assert_eq!(config.uninstaller.known_footprints_version, "1.0.0");

        // startup_manager
        assert_eq!(config.startup_manager.protected_services_whitelist_version, "1.0.0");
        assert!(!config.startup_manager.show_system_services);

        // android
        assert!(!config.android.shizuku_enabled);
        assert!(!config.android.root_enabled);
        assert!(config.android.saf_granted_uris.is_empty());

        // ui
        assert_eq!(config.ui.preview_min_size_mb, 50);
        assert_eq!(config.ui.theme, Theme::Dark);
        assert_eq!(config.ui.language, "es");

        // i18n
        assert_eq!(config.i18n.available_locales, vec!["es", "en"]);
        assert_eq!(config.i18n.fallback_locale, "en");
    }

    // ── Test: Roundtrip JSON (export → import igualdad) ──
    #[test]
    fn test_roundtrip_json() {
        let original = AppConfig::default();
        let exported = original.export_config().unwrap();
        let imported = AppConfig::import_config(&exported).unwrap();
        assert_eq!(original, imported);
    }

    // ── Test: Roundtrip con valores custom ──
    #[test]
    fn test_roundtrip_custom_values() {
        let mut config = AppConfig::default();
        config.quarantine.retention_days = 30;
        config.photos.keep_count = 3;
        config.ui.theme = Theme::Light;
        config.license.tier = LicenseTier::Pro;
        config.license.token = Some("test-token-123".to_string());

        let exported = config.export_config().unwrap();
        let imported = AppConfig::import_config(&exported).unwrap();
        assert_eq!(config, imported);
    }

    // ── Test: Save y Load a disco ──
    #[test]
    fn test_save_and_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");

        let original = AppConfig::default();
        original.save(&path).unwrap();

        let loaded = AppConfig::load(&path).unwrap();
        assert_eq!(original, loaded);
    }

    // ── Test: Load archivo inexistente retorna default ──
    #[test]
    fn test_load_nonexistent_returns_default() {
        let path = PathBuf::from("/tmp/nonexistent_gigacare_test_config.json");
        let config = AppConfig::load(&path).unwrap();
        assert_eq!(config, AppConfig::default());
    }

    // ── Test: Load archivo con contenido inválido ──
    #[test]
    fn test_load_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.json");
        std::fs::write(&path, "esto no es json").unwrap();

        let result = AppConfig::load(&path);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ConfigError::Json(_)));
    }

    // ── Test: Merge parcial - cambiar un solo campo ──
    #[test]
    fn test_merge_partial_single_field() {
        let mut config = AppConfig::default();
        let partial: serde_json::Value = serde_json::json!({
            "quarantine": {
                "retention_days": 30
            }
        });
        config.merge_partial(&partial).unwrap();

        // El campo cambiado debe actualizarse
        assert_eq!(config.quarantine.retention_days, 30);
        // El resto de quarantine mantiene defaults
        assert!((config.quarantine.max_size_gb - 5.0).abs() < f64::EPSILON);
        // Otros módulos intactos
        assert_eq!(config.photos.keep_count, 1);
        assert_eq!(config.version, 1);
    }

    // ── Test: Merge parcial - cambiar múltiples secciones ──
    #[test]
    fn test_merge_partial_multiple_sections() {
        let mut config = AppConfig::default();
        let partial: serde_json::Value = serde_json::json!({
            "photos": {
                "keep_count": 2
            },
            "ui": {
                "theme": "light",
                "language": "en"
            },
            "scanning": {
                "schedule": "daily"
            }
        });
        config.merge_partial(&partial).unwrap();

        assert_eq!(config.photos.keep_count, 2);
        assert_eq!(config.photos.phash_threshold, 8); // sin cambios
        assert_eq!(config.ui.theme, Theme::Light);
        assert_eq!(config.ui.language, "en");
        assert_eq!(config.scanning.schedule, Schedule::Daily);
        assert_eq!(config.scanning.schedule_time, "03:00"); // sin cambios
    }

    // ── Test: Merge parcial con valor inválido rechaza ──
    #[test]
    fn test_merge_partial_invalid_rejects() {
        let mut config = AppConfig::default();
        let partial: serde_json::Value = serde_json::json!({
            "quarantine": {
                "retention_days": 999
            }
        });
        let result = config.merge_partial(&partial);
        assert!(result.is_err());
        // La config original no debe cambiar tras un merge fallido
        // (en realidad el merge ya lo rechaza antes de asignar)
    }

    // ── Test: Validación - version inválida ──
    #[test]
    fn test_validation_version_invalid() {
        let mut config = AppConfig::default();
        config.version = 0;
        let err = config.validate().unwrap_err();
        assert!(matches!(err, ConfigError::Validation(_)));
        assert!(err.to_string().contains("version"));
    }

    #[test]
    fn test_validation_version_2_invalid() {
        let mut config = AppConfig::default();
        config.version = 2;
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("version"));
    }

    // ── Test: Validación - retention_days fuera de rango ──
    #[test]
    fn test_validation_retention_days_too_low() {
        let mut config = AppConfig::default();
        config.quarantine.retention_days = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_retention_days_too_high() {
        let mut config = AppConfig::default();
        config.quarantine.retention_days = 91;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_retention_days_boundary_ok() {
        let mut config = AppConfig::default();
        config.quarantine.retention_days = 1;
        assert!(config.validate().is_ok());
        config.quarantine.retention_days = 90;
        assert!(config.validate().is_ok());
    }

    // ── Test: Validación - max_size_gb ──
    #[test]
    fn test_validation_max_size_gb_zero() {
        let mut config = AppConfig::default();
        config.quarantine.max_size_gb = 0.0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_max_size_gb_negative() {
        let mut config = AppConfig::default();
        config.quarantine.max_size_gb = -1.0;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - keep_count fuera de rango ──
    #[test]
    fn test_validation_keep_count_too_low() {
        let mut config = AppConfig::default();
        config.photos.keep_count = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_keep_count_too_high() {
        let mut config = AppConfig::default();
        config.photos.keep_count = 4;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_keep_count_boundary_ok() {
        let mut config = AppConfig::default();
        config.photos.keep_count = 1;
        assert!(config.validate().is_ok());
        config.photos.keep_count = 3;
        assert!(config.validate().is_ok());
    }

    // ── Test: Validación - phash_threshold ──
    #[test]
    fn test_validation_phash_threshold_out_of_range() {
        let mut config = AppConfig::default();
        config.photos.phash_threshold = 0;
        assert!(config.validate().is_err());
        config.photos.phash_threshold = 33;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - thumbnail_max_px ──
    #[test]
    fn test_validation_thumbnail_max_px_out_of_range() {
        let mut config = AppConfig::default();
        config.photos.thumbnail_max_px = 63;
        assert!(config.validate().is_err());
        config.photos.thumbnail_max_px = 2049;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - thumbnail_quality ──
    #[test]
    fn test_validation_thumbnail_quality_out_of_range() {
        let mut config = AppConfig::default();
        config.photos.thumbnail_quality = 0;
        assert!(config.validate().is_err());
        config.photos.thumbnail_quality = 101;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - thumbnail_max_kb ──
    #[test]
    fn test_validation_thumbnail_max_kb_out_of_range() {
        let mut config = AppConfig::default();
        config.photos.thumbnail_max_kb = 0;
        assert!(config.validate().is_err());
        config.photos.thumbnail_max_kb = 10001;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - dev_inactive_threshold_days ──
    #[test]
    fn test_validation_dev_inactive_threshold_out_of_range() {
        let mut config = AppConfig::default();
        config.scanning.dev_inactive_threshold_days = 0;
        assert!(config.validate().is_err());
        config.scanning.dev_inactive_threshold_days = 366;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - temp_min_age_days ──
    #[test]
    fn test_validation_temp_min_age_out_of_range() {
        let mut config = AppConfig::default();
        config.scanning.temp_min_age_days = 0;
        assert!(config.validate().is_err());
        config.scanning.temp_min_age_days = 366;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - schedule_time formato inválido ──
    #[test]
    fn test_validation_schedule_time_invalid() {
        let mut config = AppConfig::default();
        config.scanning.schedule_time = "25:00".to_string();
        assert!(config.validate().is_err());

        config.scanning.schedule_time = "ab:cd".to_string();
        assert!(config.validate().is_err());

        config.scanning.schedule_time = "3:00".to_string();
        assert!(config.validate().is_err());

        config.scanning.schedule_time = "".to_string();
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_validation_schedule_time_valid_edges() {
        let mut config = AppConfig::default();
        config.scanning.schedule_time = "00:00".to_string();
        assert!(config.validate().is_ok());

        config.scanning.schedule_time = "23:59".to_string();
        assert!(config.validate().is_ok());
    }

    // ── Test: Validación - uninstaller_timeout_sec ──
    #[test]
    fn test_validation_uninstaller_timeout_out_of_range() {
        let mut config = AppConfig::default();
        config.uninstaller.uninstaller_timeout_sec = 4;
        assert!(config.validate().is_err());
        config.uninstaller.uninstaller_timeout_sec = 301;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - preview_min_size_mb ──
    #[test]
    fn test_validation_preview_min_size_out_of_range() {
        let mut config = AppConfig::default();
        config.ui.preview_min_size_mb = 0;
        assert!(config.validate().is_err());
        config.ui.preview_min_size_mb = 1001;
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - i18n locales vacío ──
    #[test]
    fn test_validation_locales_empty() {
        let mut config = AppConfig::default();
        config.i18n.available_locales = Vec::new();
        assert!(config.validate().is_err());
    }

    // ── Test: Validación - fallback_locale vacío ──
    #[test]
    fn test_validation_fallback_locale_empty() {
        let mut config = AppConfig::default();
        config.i18n.fallback_locale = "".to_string();
        assert!(config.validate().is_err());
    }

    // ── Test: Serialización JSON tiene la estructura esperada ──
    #[test]
    fn test_json_structure() {
        let config = AppConfig::default();
        let json: serde_json::Value = serde_json::to_value(&config).unwrap();

        assert_eq!(json["version"], 1);
        assert_eq!(json["quarantine"]["retention_days"], 7);
        assert_eq!(json["scanning"]["schedule"], "weekly");
        assert_eq!(json["photos"]["keep_count"], 1);
        assert_eq!(json["license"]["tier"], "free");
        assert_eq!(json["ui"]["theme"], "dark");
        assert_eq!(json["ai_providers"]["rate_limits"]["google_ai_studio"], 10);
        assert!(json["ai_providers"]["byok_keys"]["google_ai_studio"].is_null());
    }

    // ── Test: LicenseTier serialización ──
    #[test]
    fn test_license_tier_serialization() {
        assert_eq!(serde_json::to_string(&LicenseTier::Free).unwrap(), "\"free\"");
        assert_eq!(serde_json::to_string(&LicenseTier::Byok).unwrap(), "\"byok\"");
        assert_eq!(serde_json::to_string(&LicenseTier::Pro).unwrap(), "\"pro\"");
    }

    // ── Test: Schedule serialización ──
    #[test]
    fn test_schedule_serialization() {
        assert_eq!(serde_json::to_string(&Schedule::Daily).unwrap(), "\"daily\"");
        assert_eq!(serde_json::to_string(&Schedule::Weekly).unwrap(), "\"weekly\"");
        assert_eq!(serde_json::to_string(&Schedule::Monthly).unwrap(), "\"monthly\"");
        assert_eq!(serde_json::to_string(&Schedule::Manual).unwrap(), "\"manual\"");
    }

    // ── Test: Theme serialización ──
    #[test]
    fn test_theme_serialization() {
        assert_eq!(serde_json::to_string(&Theme::Dark).unwrap(), "\"dark\"");
        assert_eq!(serde_json::to_string(&Theme::Light).unwrap(), "\"light\"");
        assert_eq!(serde_json::to_string(&Theme::System).unwrap(), "\"system\"");
    }

    // ── Test: Save valida antes de guardar ──
    #[test]
    fn test_save_rejects_invalid() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("invalid.json");
        let mut config = AppConfig::default();
        config.version = 99;
        let result = config.save(&path);
        assert!(result.is_err());
        // El archivo no debe existir
        assert!(!path.exists());
    }

    // ── Test: Import rechaza JSON inválido ──
    #[test]
    fn test_import_invalid_json_string() {
        let result = AppConfig::import_config("not json");
        assert!(result.is_err());
    }

    // ── Test: Import rechaza config con valores fuera de rango ──
    #[test]
    fn test_import_out_of_range_rejects() {
        let config = AppConfig::default();
        // Bypass: serialize primero, luego modifica el JSON manualmente
        let mut json: serde_json::Value = serde_json::to_value(&config).unwrap();
        json["quarantine"]["retention_days"] = serde_json::json!(999);
        let json_str = serde_json::to_string(&json).unwrap();

        let result = AppConfig::import_config(&json_str);
        assert!(result.is_err());
    }

    // ── Test: ConfigError Display ──
    #[test]
    fn test_error_display() {
        let err = ConfigError::Validation("test error".to_string());
        assert_eq!(err.to_string(), "Validación fallida: test error");
    }

    // ── Test: Save crea directorios padre ──
    #[test]
    fn test_save_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a").join("b").join("c").join("config.json");
        let config = AppConfig::default();
        config.save(&path).unwrap();
        assert!(path.exists());
    }

    // ── Test: Merge parcial no modifica version ──
    #[test]
    fn test_merge_keeps_version() {
        let mut config = AppConfig::default();
        let partial = serde_json::json!({"ui": {"language": "en"}});
        config.merge_partial(&partial).unwrap();
        assert_eq!(config.version, 1);
    }

    // ── Test: Merge con version distinta rechaza ──
    #[test]
    fn test_merge_wrong_version_rejects() {
        let mut config = AppConfig::default();
        let partial = serde_json::json!({"version": 2});
        let result = config.merge_partial(&partial);
        assert!(result.is_err());
    }

    // ── Test: Roundtrip con save/load tras merge parcial ──
    #[test]
    fn test_save_load_after_merge() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("merged.json");

        let mut config = AppConfig::default();
        config.merge_partial(&serde_json::json!({
            "photos": {"keep_count": 2},
            "ui": {"theme": "system"}
        })).unwrap();

        config.save(&path).unwrap();
        let loaded = AppConfig::load(&path).unwrap();
        assert_eq!(config, loaded);
        assert_eq!(loaded.photos.keep_count, 2);
        assert_eq!(loaded.ui.theme, Theme::System);
    }

    // ── Test: deep_merge helper ──
    #[test]
    fn test_deep_merge_function() {
        let base = serde_json::json!({"a": {"b": 1, "c": 2}, "d": 3});
        let overlay = serde_json::json!({"a": {"b": 99}});
        let result = deep_merge(base, overlay);
        assert_eq!(result["a"]["b"], 99);
        assert_eq!(result["a"]["c"], 2);
        assert_eq!(result["d"], 3);
    }

    // ── Test: deep_merge con overlay escalar reemplaza ──
    #[test]
    fn test_deep_merge_scalar_override() {
        let base = serde_json::json!({"a": {"b": 1}});
        let overlay = serde_json::json!({"a": "replaced"});
        let result = deep_merge(base, overlay);
        assert_eq!(result["a"], "replaced");
    }

    // ── Test: is_valid_time helper ──
    #[test]
    fn test_is_valid_time() {
        assert!(is_valid_time("00:00"));
        assert!(is_valid_time("12:30"));
        assert!(is_valid_time("23:59"));
        assert!(!is_valid_time("24:00"));
        assert!(!is_valid_time("12:60"));
        assert!(!is_valid_time("1:00"));
        assert!(!is_valid_time(""));
        assert!(!is_valid_time("abc"));
        assert!(!is_valid_time("12-30"));
    }

    // ── Test: Todas las secciones tienen Default ──
    #[test]
    fn test_all_sub_defaults() {
        let _ = QuarantineConfig::default();
        let _ = ScanningConfig::default();
        let _ = PhotosConfig::default();
        let _ = AiProvidersConfig::default();
        let _ = LicenseConfig::default();
        let _ = UninstallerConfig::default();
        let _ = StartupManagerConfig::default();
        let _ = AndroidConfig::default();
        let _ = UiConfig::default();
        let _ = I18nConfig::default();
        let _ = AiRateLimits::default();
        let _ = AiByokKeys::default();
    }

    // ── Test: Clone funciona ──
    #[test]
    fn test_clone() {
        let config = AppConfig::default();
        let cloned = config.clone();
        assert_eq!(config, cloned);
    }

    // ── Test: Debug trait ──
    #[test]
    fn test_debug_trait() {
        let config = AppConfig::default();
        let debug_str = format!("{:?}", config);
        assert!(debug_str.contains("AppConfig"));
        assert!(debug_str.contains("version: 1"));
    }
}