//! Sistema de eventos de progreso para GigaCare.
//!
//! Define los eventos emitidos durante escaneo, limpieza y análisis IA,
//! transmitidos mediante canales `tokio::sync::mpsc`.

use serde::{Deserialize, Serialize};
use std::fmt;

// ─────────────────────────── ScanModule ───────────────────────────

/// Módulos de escaneo disponibles en GigaCare.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanModule {
    /// Caché de aplicaciones de mensajería (WhatsApp, Telegram, etc.)
    MessagingCache,
    /// Dependencias de desarrollo inactivas (node_modules, target, etc.)
    DevDependencies,
    /// Archivos temporales del sistema
    SystemTemp,
    /// Instaladores obsoletos (.exe, .msi, .dmg)
    Installers,
    /// Fotos duplicadas (usando hashing perceptual)
    PhotoDuplicates,
    /// Residuos de desinstalación
    UninstallResiduals,
    /// Elementos de inicio (startup items)
    StartupItems,
}

impl ScanModule {
    /// Retorna el identificador de módulo como string (para serialización en resultados).
    pub fn as_str(&self) -> &'static str {
        match self {
            ScanModule::MessagingCache => "messaging_cache",
            ScanModule::DevDependencies => "dev_dependencies",
            ScanModule::SystemTemp => "system_temp",
            ScanModule::Installers => "installers",
            ScanModule::PhotoDuplicates => "photo_duplicates",
            ScanModule::UninstallResiduals => "uninstall_residuals",
            ScanModule::StartupItems => "startup_items",
        }
    }

    /// Retorna todos los módulos disponibles.
    pub fn all() -> Vec<ScanModule> {
        vec![
            ScanModule::MessagingCache,
            ScanModule::DevDependencies,
            ScanModule::SystemTemp,
            ScanModule::Installers,
            ScanModule::PhotoDuplicates,
            ScanModule::UninstallResiduals,
            ScanModule::StartupItems,
        ]
    }
}

impl fmt::Display for ScanModule {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ─────────────────────────── ScanProgress ─────────────────────────

/// Evento de progreso emitido durante el escaneo de un módulo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    /// Módulo que está siendo escaneado.
    pub module: ScanModule,
    /// Número de items escaneados (revisados) hasta ahora.
    pub items_scanned: u64,
    /// Número de items encontrados que califican para limpieza.
    pub items_found: u64,
    /// Total de bytes encontrados recuperables.
    pub bytes_found: u64,
    /// Porcentaje de avance (0.0 - 100.0).
    pub percent: f32,
    /// Segundos estimados restantes, si es posible calcular.
    pub eta_seconds: Option<u64>,
}

// ─────────────────────────── CleanProgress ────────────────────────

/// Evento de progreso emitido durante la limpieza (movimiento a cuarentena).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanProgress {
    /// Número de items ya movidos a cuarentena.
    pub items_moved: u64,
    /// Total de items a mover.
    pub items_total: u64,
    /// Ruta del archivo que se está procesando actualmente.
    pub current_file: String,
    /// Bytes liberados hasta ahora.
    pub bytes_freed: u64,
}

// ─────────────────────────── AiAnalysisProgress ───────────────────

/// Evento de progreso emitido durante el análisis de fotos con IA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAnalysisProgress {
    /// Número de grupos de fotos analizados.
    pub groups_analyzed: u64,
    /// Total de grupos a analizar.
    pub groups_total: u64,
    /// Proveedor de IA actualmente en uso.
    pub current_provider: String,
    /// ID del grupo que se está analizando.
    pub current_group_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_module_as_str() {
        assert_eq!(ScanModule::MessagingCache.as_str(), "messaging_cache");
        assert_eq!(ScanModule::DevDependencies.as_str(), "dev_dependencies");
        assert_eq!(ScanModule::SystemTemp.as_str(), "system_temp");
        assert_eq!(ScanModule::Installers.as_str(), "installers");
        assert_eq!(ScanModule::PhotoDuplicates.as_str(), "photo_duplicates");
        assert_eq!(ScanModule::UninstallResiduals.as_str(), "uninstall_residuals");
        assert_eq!(ScanModule::StartupItems.as_str(), "startup_items");
    }

    #[test]
    fn test_scan_module_all() {
        let all = ScanModule::all();
        assert_eq!(all.len(), 7);
    }

    #[test]
    fn test_scan_module_display() {
        assert_eq!(format!("{}", ScanModule::MessagingCache), "messaging_cache");
    }

    #[test]
    fn test_scan_progress_serialize() {
        let progress = ScanProgress {
            module: ScanModule::SystemTemp,
            items_scanned: 100,
            items_found: 10,
            bytes_found: 1024,
            percent: 50.0,
            eta_seconds: Some(30),
        };
        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("system_temp"));
        assert!(json.contains("50.0"));

        // Roundtrip
        let deserialized: ScanProgress = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.items_scanned, 100);
        assert_eq!(deserialized.items_found, 10);
    }

    #[test]
    fn test_clean_progress_serialize() {
        let progress = CleanProgress {
            items_moved: 5,
            items_total: 20,
            current_file: "C:\\temp\\test.tmp".to_string(),
            bytes_freed: 2048,
        };
        let json = serde_json::to_string(&progress).unwrap();
        let deserialized: CleanProgress = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.items_moved, 5);
        assert_eq!(deserialized.items_total, 20);
    }

    #[test]
    fn test_ai_analysis_progress_serialize() {
        let progress = AiAnalysisProgress {
            groups_analyzed: 3,
            groups_total: 10,
            current_provider: "google_ai_studio".to_string(),
            current_group_id: "group-001".to_string(),
        };
        let json = serde_json::to_string(&progress).unwrap();
        let deserialized: AiAnalysisProgress = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.groups_analyzed, 3);
        assert_eq!(deserialized.current_provider, "google_ai_studio");
    }

    #[test]
    fn test_scan_module_serde_roundtrip() {
        let module = ScanModule::DevDependencies;
        let json = serde_json::to_string(&module).unwrap();
        assert_eq!(json, "\"dev_dependencies\"");
        let deserialized: ScanModule = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, module);
    }
}