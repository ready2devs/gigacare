//! Tipos de error del crate gigacare-core.

use thiserror::Error;

/// Errores posibles en el orquestador core de GigaCare.
#[derive(Debug, Error)]
pub enum CoreError {
    /// Error de I/O al acceder al sistema de archivos.
    #[error("Error de I/O: {0}")]
    Io(#[from] std::io::Error),

    /// Error de serialización/deserialización JSON.
    #[error("Error de JSON: {0}")]
    Json(#[from] serde_json::Error),

    /// Error de configuración.
    #[error("Error de configuración: {0}")]
    Config(#[from] gigacare_config::ConfigError),

    /// Operación cancelada por el usuario.
    #[error("Operación cancelada")]
    Cancelled,

    /// Módulo de escaneo no encontrado o no registrado.
    #[error("Módulo no encontrado: {0}")]
    ModuleNotFound(String),

    /// Error genérico con mensaje descriptivo.
    #[error("{0}")]
    Other(String),
}

/// Alias de Result con `CoreError`.
pub type Result<T> = std::result::Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cancelled_error_display() {
        let err = CoreError::Cancelled;
        assert_eq!(format!("{err}"), "Operación cancelada");
    }

    #[test]
    fn test_module_not_found_display() {
        let err = CoreError::ModuleNotFound("custom_module".to_string());
        assert!(format!("{err}").contains("custom_module"));
    }

    #[test]
    fn test_other_error_display() {
        let err = CoreError::Other("algo falló".to_string());
        assert_eq!(format!("{err}"), "algo falló");
    }

    #[test]
    fn test_io_error_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "no encontrado");
        let core_err: CoreError = io_err.into();
        assert!(matches!(core_err, CoreError::Io(_)));
        assert!(format!("{core_err}").contains("I/O"));
    }
}