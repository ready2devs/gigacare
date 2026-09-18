use serde::{Deserialize, Serialize};
use gigacare_license::LicenseTier;

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivationResult {
    pub success: bool,
    pub tier: String,
    pub message: String,
}

#[tauri::command]
pub fn validate_api_key(provider: String, key: String) -> ValidationResult {
    let valid = !key.trim().is_empty();
    ValidationResult {
        valid,
        message: if valid { format!("Clave válida para {}", provider) } else { "Clave vacía".into() },
    }
}

#[tauri::command]
pub fn get_license_tier() -> String {
    let info = gigacare_license::validate_license(None);
    format!("{}", info.tier)
}

#[tauri::command]
pub fn activate_pro(token: String) -> ActivationResult {
    let info = gigacare_license::validate_license(Some(&token));
    let success = matches!(info.tier, LicenseTier::Pro);
    ActivationResult {
        success,
        tier: format!("{}", info.tier),
        message: if success { "Licencia Pro activada".into() } else { "Token inválido".into() },
    }
}
