//! # GigaCare Core
//!
//! Orquestador principal del sistema de optimización GigaCare.
//!
//! Este crate coordina los módulos de escaneo, cuarentena, configuración
//! y análisis de fotos con IA. Provee:
//!
//! - **Scanner**: Struct orquestador que ejecuta módulos de escaneo secuencialmente.
//! - **Eventos**: `ScanProgress`, `CleanProgress`, `AiAnalysisProgress` emitidos
//!   por canales `tokio::sync::mpsc`.
//! - **Modelos**: `ScanResult`, `ScanItem`, `ModuleScanResult`, etc. según la
//!   especificación del proyecto.
//! - **API pública**: `scan_smart_care(modules, config)` para ejecutar escaneos.
//!
//! # Ejemplo
//!
//! ```rust,no_run
//! use gigacare_core::scanner::Scanner;
//! use gigacare_core::events::{ScanModule, ScanProgress};
//! use gigacare_config::AppConfig;
//! use tokio::sync::mpsc;
//!
//! # async fn example() -> gigacare_core::error::Result<()> {
//! let config = AppConfig::default();
//! let (tx, mut rx) = mpsc::channel::<ScanProgress>(64);
//!
//! let scanner = Scanner::new(config, tx);
//!
//! // Escanear todos los módulos
//! let result = scanner.scan_smart_care(None).await?;
//! println!("Encontrados {} items ({} bytes)", result.total_items, result.total_recoverable_bytes);
//!
//! // O escanear módulos específicos
//! let result = scanner.scan_smart_care(Some(vec![
//!     ScanModule::SystemTemp,
//!     ScanModule::MessagingCache,
//! ])).await?;
//! # Ok(())
//! # }
//! ```

pub mod error;
pub mod events;
pub mod models;
pub mod scanner;

// Re-exports de conveniencia
pub use error::{CoreError, Result};
pub use events::{ScanModule, ScanProgress, CleanProgress, AiAnalysisProgress};
pub use models::{ScanResult, ScanItem, ModuleScanResult, ScanFilters};
pub use scanner::Scanner;