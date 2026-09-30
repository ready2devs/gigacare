use std::process::Command;
use std::time::{Duration, Instant};
use std::thread;

use crate::models::UninstallResult;

pub const DEFAULT_UNINSTALL_TIMEOUT: Duration = Duration::from_secs(30);

/// Ejecuta un comando de desinstalación con un tiempo límite configurable.
pub fn run_uninstall_command(command_str: &str, timeout: Duration) -> UninstallResult {
    let trimmed = command_str.trim();
    if trimmed.is_empty() {
        return UninstallResult {
            success: false,
            exit_code: None,
            message: "Comando de desinstalación vacío".to_string(),
            timed_out: false,
        };
    }

    #[cfg(windows)]
    let mut child = match Command::new("cmd")
        .args(["/C", trimmed])
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return UninstallResult {
                success: false,
                exit_code: None,
                message: format!("Error al iniciar el proceso: {}", e),
                timed_out: false,
            };
        }
    };

    #[cfg(not(windows))]
    let mut child = match Command::new("sh")
        .args(["-c", trimmed])
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return UninstallResult {
                success: false,
                exit_code: None,
                message: format!("Error al iniciar el proceso: {}", e),
                timed_out: false,
            };
        }
    };

    let start_time = Instant::now();
    let poll_interval = Duration::from_millis(50);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let code = status.code();
                let success = status.success();
                return UninstallResult {
                    success,
                    exit_code: code,
                    message: if success {
                        "Desinstalación finalizada con éxito".to_string()
                    } else {
                        format!("El comando finalizó con código de salida: {:?}", code)
                    },
                    timed_out: false,
                };
            }
            Ok(None) => {
                if start_time.elapsed() >= timeout {
                    let _ = child.kill();
                    return UninstallResult {
                        success: false,
                        exit_code: None,
                        message: format!("Tiempo de espera agotado ({:?})", timeout),
                        timed_out: true,
                    };
                }
                thread::sleep(poll_interval);
            }
            Err(e) => {
                let _ = child.kill();
                return UninstallResult {
                    success: false,
                    exit_code: None,
                    message: format!("Error esperando el proceso: {}", e),
                    timed_out: false,
                };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task10_mock_command_success() {
        // Ejecutar un comando que retorna código de salida 0
        #[cfg(windows)]
        let cmd = "exit 0";
        #[cfg(not(windows))]
        let cmd = "true";

        let result = run_uninstall_command(cmd, Duration::from_secs(5));
        assert!(result.success, "Debe ser exitoso");
        assert_eq!(result.exit_code, Some(0));
        assert!(!result.timed_out, "No debe agotarse el tiempo");
    }

    #[test]
    fn test_task10_mock_command_timeout() {
        // Ejecutar un comando que tarda más que el timeout establecido (200ms)
        #[cfg(windows)]
        let cmd = "ping 127.0.0.1 -n 4 > nul";
        #[cfg(not(windows))]
        let cmd = "sleep 2";

        let result = run_uninstall_command(cmd, Duration::from_millis(200));
        assert!(!result.success, "No debe ser exitoso por timeout");
        assert!(result.timed_out, "timed_out debe ser true");
        assert!(result.message.contains("Tiempo de espera agotado"));
    }
}
