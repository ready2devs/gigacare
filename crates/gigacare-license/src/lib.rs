//! # gigacare-license
//!
//! Validación de licencias JWT firmadas con RSA-256 para GigaCare.
//!
//! ## Comportamiento
//! - Sin token → tier Free
//! - Token expirado → tier Free
//! - Firma inválida → tier Free
//! - Token válido → extrae tier y fecha de expiración

use chrono::{DateTime, TimeZone, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::fmt;

// ─────────────────────────────────────────────
// Clave pública RSA embebida (para verificar firmas)
// ─────────────────────────────────────────────
/// Clave pública RSA-2048 embebida para verificar tokens JWT.
/// En producción, reemplazar con la clave pública real del servidor de licencias.
pub const PUB_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAskJAdJkBdKkwarB5kpW6
/BUV4mpOK/ZBw6oDPHD4HqXXtfDOKMvKPMHjM8nFNcEeItPgOhh9PoAFoWu7jTZZ
XR9JLoPaodvOkf/6q1EUl3DkFnXsckUYa+MV+5h2EspDM9uqatGfZ2DOo/39tyzc
Cv8Nvit6n9uqXUa2q8ruP5aw+avPKxQ2TInGdCkN03H09jF6/+bc/q9lpCP9zafH
N4UKvh6b1FjfDCU+daG66yJxQ2KDVmP2GsLZOJmTpXZLoLJx36h4RmtfeBQz12n9
F//3Z9r/3CHgeNjV8k1sZoDD8EPLt9fI3Jcl613cX4x1fvkEMwOXso7onRTqHmvn
kwIDAQAB
-----END PUBLIC KEY-----"#;

// ─────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────

/// Nivel de licencia del usuario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LicenseTier {
    /// Nivel gratuito (por defecto).
    Free,
    /// Bring Your Own Key – el usuario provee su propia API key.
    Byok,
    /// Nivel profesional con todas las funcionalidades.
    Pro,
}

impl fmt::Display for LicenseTier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LicenseTier::Free => write!(f, "free"),
            LicenseTier::Byok => write!(f, "byok"),
            LicenseTier::Pro => write!(f, "pro"),
        }
    }
}

impl Default for LicenseTier {
    fn default() -> Self {
        LicenseTier::Free
    }
}

/// Información de licencia validada.
#[derive(Debug, Clone)]
pub struct LicenseInfo {
    /// Nivel de la licencia.
    pub tier: LicenseTier,
    /// Fecha de expiración del token (si existe y es válido).
    pub expires_at: Option<DateTime<Utc>>,
    /// Indica si el token fue validado exitosamente.
    pub is_valid: bool,
}

impl Default for LicenseInfo {
    fn default() -> Self {
        Self {
            tier: LicenseTier::Free,
            expires_at: None,
            is_valid: false,
        }
    }
}

/// Claims del payload JWT de licencia.
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseClaims {
    /// Subject (identificador del usuario/licencia).
    pub sub: String,
    /// Nivel de licencia como string ("free", "byok", "pro").
    pub tier: String,
    /// Timestamp UNIX de expiración.
    pub exp: i64,
    /// Timestamp UNIX de emisión.
    pub iat: i64,
}

// ─────────────────────────────────────────────
// Errores internos (no expuestos — siempre retornamos Free)
// ─────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
enum LicenseError {
    #[error("Token JWT inválido: {0}")]
    InvalidToken(#[from] jsonwebtoken::errors::Error),
    #[error("Tier desconocido: {0}")]
    UnknownTier(String),
}

// ─────────────────────────────────────────────
// Funciones públicas
// ─────────────────────────────────────────────

/// Valida un token JWT de licencia y retorna la información de licencia.
///
/// ## Comportamiento seguro (nunca panic)
/// - `None` → `LicenseInfo { tier: Free, expires_at: None, is_valid: false }`
/// - Token con firma inválida → Free
/// - Token expirado → Free
/// - Token válido → extrae tier y fecha de expiración
pub fn validate_license(token: Option<&str>) -> LicenseInfo {
    let token = match token {
        Some(t) if !t.is_empty() => t,
        _ => return LicenseInfo::default(),
    };

    match decode_and_validate(token) {
        Ok(info) => info,
        Err(_) => LicenseInfo::default(),
    }
}

/// Wrapper conveniente que retorna solo el tier de la licencia.
pub fn get_tier(token: Option<&str>) -> LicenseTier {
    validate_license(token).tier
}

// ─────────────────────────────────────────────
// Lógica interna
// ─────────────────────────────────────────────

/// Decodifica y valida el token JWT contra la clave pública embebida.
fn decode_and_validate(token: &str) -> Result<LicenseInfo, LicenseError> {
    let decoding_key = DecodingKey::from_rsa_pem(PUB_KEY_PEM.as_bytes())
        .map_err(|e| LicenseError::InvalidToken(e))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;
    validation.required_spec_claims.insert("exp".to_string());
    validation.required_spec_claims.insert("sub".to_string());

    let token_data = decode::<LicenseClaims>(token, &decoding_key, &validation)?;
    let claims = token_data.claims;

    let tier = parse_tier(&claims.tier)?;
    let expires_at = Utc.timestamp_opt(claims.exp, 0).single();

    Ok(LicenseInfo {
        tier,
        expires_at,
        is_valid: true,
    })
}

/// Parsea un string de tier a `LicenseTier`.
fn parse_tier(tier_str: &str) -> Result<LicenseTier, LicenseError> {
    match tier_str.to_lowercase().as_str() {
        "free" => Ok(LicenseTier::Free),
        "byok" => Ok(LicenseTier::Byok),
        "pro" => Ok(LicenseTier::Pro),
        other => Err(LicenseError::UnknownTier(other.to_string())),
    }
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use chrono::Duration;

    /// Clave privada RSA de prueba (SOLO para tests).
    const TEST_PRIVATE_KEY_PEM: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCyQkB0mQF0qTBq
sHmSlbr8FRXiak4r9kHDqgM8cPgepde18M4oy8o8weMzycU1wR4i0+A6GH0+gAWh
a7uNNlldH0kug9qh286R//qrURSXcOQWdexyRRhr4xX7mHYSykMz26pq0Z9nYM6j
/f23LNwK/w2+K3qf26pdRraryu4/lrD5q88rFDZMicZ0KQ3TcfT2MXr/5tz+r2Wk
I/3Np8c3hQq+HpvUWN8MJT51obrrInFDYoNWY/Yawtk4mZOldkugsnHfqHhGa194
FDPXaf0X//dn2v/cIeB42NXyTWxmgMPwQ8u318jclyXrXdxfjHV++QQzA5eyjuid
FOoea+eTAgMBAAECggEASLO+qA9TSapLZegN3VwWBAPxhgOHWGS6U7v+T+NfPtiy
zrCk1HyxQfBt4sxTE2ZtDRVO6ULdqeT65ugSeTiGX/WHmmIKhGMqr98v9DlAZbeU
PxjfU4ecuzvF1nRLC8TUfc0Eh0Zxde9EuBu6I8A3CoEVsM7410P3Cs3xaMV+QA5e
En3LjdGKQQVVkT6m67E/dfn1iIG5p5nAuNOLCbx8NCYRRqY7vtIt+5PBgHkmD82n
QSF/XmHNLWc4IwJxtDWxa12ZHNFAS5xemQ1Jp+N8IcK+SzKhl1CPPb0a47h9bH6I
w9q2fr0bWfLgxn/gSB16wrqKKcZQoPQCPWuBOgVBIQKBgQDjBeSsKS9JBkcPKdO2
gUpgLkI7QK8bE/swF8Og4dZyNPcpkh3QOt7WVAMhxEkPLMV5eAUz6ZBYszFqqvia
gUcCh1Eqizs929OlezTrwzQlxoTf//8d/gjzwUEhMDlbxsP1cMaQef83g5bu67lq
hMAOctwchd/vgD7HAFOyxGR8YwKBgQDJAvWshsXsZcPsAnOHNKdpf2PD7sSm9liu
sxieTgpqS4EZVnSuPl2XJnhH9lPi8w1lhvQ4S9vdizs39WpzWuDvRSi6Uv8CCMec
0eYG6UNRDCFqbM07Bq0fkkjUFB3XoLSMWe5IPmBlh5CjZ2tMFxn0IhTBZrNxHPVa
U6uhtL5XEQKBgQCBGffZo64dM/GzANFBxzKZkZTeh0FM/8bnqYv5cJR37ADmZg6I
PQI+FhaV3D7D320JT6R9ygPpPTYL9+BaVMwh9vvEWts8qUcpovAMZrzAAq3LiJP2
5WEH5U15ZygnNdh4OkLhJE9rrWxmwCx4E7f4P39GxSb81wxcNKZkUeTnCwKBgH7w
oor4dYdrYMXral/JDawe6bbzUzcJPUneCj72k7c6xWVl5rue4OWyQqVXVvRsf1pN
Vm8y4L9QzO3yyu3cR05zA1xfS3FScBSFrVlR99P38CZQXW7YMX5NmDZuGcZxU3OK
22K+GYwkh1/Z0LW1pQs6dpcIL2vQWNVZH3s4NDexAoGAAkbZ3fTZ9fY6HoKVFMHj
XzRlo+sdBU8up+QLvHoGOAS6fRp8K+eTAYGTn5Fjqj2m9TX30erHCi2z7T4427cB
KbWf6uFXjT8gFM0BBRtQANe83Y7/EAz6l9B2YrL1Yf5B4tkl2Op1aPxhPD2NCTBc
dunfX2L3JWI2A3fEUIQxg18=
-----END PRIVATE KEY-----"#;

    /// Clave privada RSA alternativa (diferente) para test de firma inválida.
    /// Generada independientemente — NO corresponde a PUB_KEY_PEM.
    const WRONG_PRIVATE_KEY_PEM: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDJ7s0/a7ZigrKU
+Ub/HCr57z7tfSuP7Wtyjvvd94dKVFHIxCz++iT6sz9mj6dvAebBg+lmVk/8xiKo
ioUbGJyeG5B0XQQJIRDnfbMFoVx4z+j0NK86iK+yrnaYbEIqbIY8PYojCJMiTMlg
bOC1Dvn+WTqEFmTn41a0WQnZ0Bmd3lSKwtAmk4rarRyJygVEZgUBl81O3AmMcTn4
Jw3QEl2Bz6Jq5mrxZf8XQe8RyLNnwzw0pHdfDH/TT8oNcbuVluCp0TiQOBJmESe0
RviGZmVWUN1MSJ4nqMRQT9KidhhxMh4cCbKwrNdYr6oqKojwX3csURdyllAEP+5y
CAR8JccXAgMBAAECggEABcje4+7PyVMMwjKN5rSSd2YNVTvqHPP9/JWKAFoDhYz6
0GSGR9ueMyxVWziV4RrN1t25Hu+UC2qybXkvLPW8iG726WgMu78EJY2DrMKdmO+W
/cy294p/QszqpGn3HBE1zmrFsHeh0P0gIhbPk4A7ux4ocsY6QV/q1bz2bxRRPfHZ
tIXetAiAVbP4S6TJOTotm08dy1300voRgM3eIKqSHCYOEFyxsjskTiHcs1jJtua0
gYcpIHv/kLWACalVY9dS1YW1DANXCCU9qbxArajMGatzp25dKHR+Hwan5uvhxxZm
flNsOBO81oB0jXGqrtX8E0n3M608lcmLFm1OKgt/0QKBgQDodnaGoNlgUqQDTRci
7it2zoY8GmVKfEvD1Np6OO1i/wF/wNK5FdjXxPbY95Rolb8rj7EENn10WO3oZHrW
I1ydN1AtWuFtYGnLAFgUBDtmc9FGzfQ1cpKsG08OnAkFFxFYshdxQ5EeQIxI/25n
Do6d+1dRZe6ujZ13FjaiOMFGfwKBgQDeYP1U9mLfpH40JwisAnoYEtgJdkb+pIT0
zikh7kOpm0zPnpnrHHrx29RJPFYgz0k5qBQBPPfe5sBbrdmZcXnL4bL0jm/kY9cr
GUlZ5erwldEWFjQl45PnBRbyjccrADdM2v/KNS4IsfcqJXEJL+m0gDHOAcue+nng
KweZ7oOjaQKBgFP0fMgQjZFpJ0z96Y43AEGPQxGv4scs7twSIrmjl7B6MptmE3S+
/CqpOxGPEO1Yr8tWwPKpj1OWzo1wxKBT8x3gnTdULDgpauvi+ux3vtA4oet1dG5d
K7W2wy2eku9grmYfI7JHWcDYRRIUFlZn/n/2B0ohiztFcApTXnXmE3+XAoGAcKIb
be8lgTTlnzCuGcFfadYRiilYKB3YIc5R0xfFOaCpNPeV6hmQw/OeAEIJNbEH26Yg
C8h/m2ywvT6+2hM5p2R3qZqDXeCb2P6Dwn7LknOvZUp1u0MbZIWVa+EXodYILGs3
54kr+cd58uTn7clQy9WqZDdQlQM0u6/Pt82w6xECgYBHJIq+OUXe5s4Duqivhx//
d+GhoXdEDl0kbddGumYht8ondU+U3lcrIrWqWmCzBr5BQ+ctS1Erjian1OD75kBu
nNXrN0hJwGnmb3qMw4+6YxTAeMperB6Y3n9kMhZyMZEoUkmHSoPQArP2qm7Vvj72
3zpgZlYBk//v7KFL12pOfQ==
-----END PRIVATE KEY-----"#;

    /// Helper: crea un token JWT firmado con la clave privada de test.
    fn create_test_token(tier: &str, expires_in_secs: i64) -> String {
        let now = Utc::now();
        let claims = LicenseClaims {
            sub: "test-user-001".to_string(),
            tier: tier.to_string(),
            exp: (now + Duration::seconds(expires_in_secs)).timestamp(),
            iat: now.timestamp(),
        };
        let encoding_key =
            EncodingKey::from_rsa_pem(TEST_PRIVATE_KEY_PEM.as_bytes()).unwrap();
        encode(&Header::new(Algorithm::RS256), &claims, &encoding_key).unwrap()
    }

    /// Helper: crea un token JWT firmado con una clave privada DIFERENTE.
    fn create_wrong_signature_token(tier: &str) -> String {
        let now = Utc::now();
        let claims = LicenseClaims {
            sub: "test-user-002".to_string(),
            tier: tier.to_string(),
            exp: (now + Duration::seconds(3600)).timestamp(),
            iat: now.timestamp(),
        };
        let encoding_key =
            EncodingKey::from_rsa_pem(WRONG_PRIVATE_KEY_PEM.as_bytes()).unwrap();
        encode(&Header::new(Algorithm::RS256), &claims, &encoding_key).unwrap()
    }

    // ── Test 1: Sin token → Free ──────────────────────────

    #[test]
    fn test_no_token_returns_free() {
        let info = validate_license(None);
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(info.expires_at.is_none());
        assert!(!info.is_valid);
    }

    #[test]
    fn test_empty_token_returns_free() {
        let info = validate_license(Some(""));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(!info.is_valid);
    }

    // ── Test 2: Token expirado → Free ─────────────────────

    #[test]
    fn test_expired_token_returns_free() {
        // Token que expiró hace 1 hora
        let token = create_test_token("pro", -3600);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(!info.is_valid);
    }

    // ── Test 3: Firma inválida → Free ─────────────────────

    #[test]
    fn test_invalid_signature_returns_free() {
        let token = create_wrong_signature_token("pro");
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(!info.is_valid);
    }

    #[test]
    fn test_garbage_token_returns_free() {
        let info = validate_license(Some("not.a.valid.jwt.token"));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(!info.is_valid);
    }

    // ── Test 4: Token válido → tier correcto ──────────────

    #[test]
    fn test_valid_pro_token() {
        let token = create_test_token("pro", 3600);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Pro);
        assert!(info.expires_at.is_some());
        assert!(info.is_valid);
    }

    #[test]
    fn test_valid_byok_token() {
        let token = create_test_token("byok", 7200);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Byok);
        assert!(info.expires_at.is_some());
        assert!(info.is_valid);
    }

    #[test]
    fn test_valid_free_token() {
        let token = create_test_token("free", 3600);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(info.is_valid);
    }

    // ── Test: get_tier wrapper ─────────────────────────────

    #[test]
    fn test_get_tier_none() {
        assert_eq!(get_tier(None), LicenseTier::Free);
    }

    #[test]
    fn test_get_tier_valid() {
        let token = create_test_token("pro", 3600);
        assert_eq!(get_tier(Some(&token)), LicenseTier::Pro);
    }

    #[test]
    fn test_get_tier_expired() {
        let token = create_test_token("pro", -3600);
        assert_eq!(get_tier(Some(&token)), LicenseTier::Free);
    }

    // ── Test: Display y Default ────────────────────────────

    #[test]
    fn test_tier_display() {
        assert_eq!(LicenseTier::Free.to_string(), "free");
        assert_eq!(LicenseTier::Byok.to_string(), "byok");
        assert_eq!(LicenseTier::Pro.to_string(), "pro");
    }

    #[test]
    fn test_tier_default() {
        assert_eq!(LicenseTier::default(), LicenseTier::Free);
    }

    #[test]
    fn test_license_info_default() {
        let info = LicenseInfo::default();
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(info.expires_at.is_none());
        assert!(!info.is_valid);
    }

    // ── Test: Tier desconocido → Free ──────────────────────

    #[test]
    fn test_unknown_tier_returns_free() {
        let token = create_test_token("enterprise", 3600);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Free);
        assert!(!info.is_valid);
    }

    // ── Test: Serde ────────────────────────────────────────

    #[test]
    fn test_tier_serde_roundtrip() {
        let json = serde_json::to_string(&LicenseTier::Pro).unwrap();
        assert_eq!(json, r#""pro""#);
        let deserialized: LicenseTier = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, LicenseTier::Pro);
    }

    #[test]
    fn test_tier_case_insensitive() {
        // La función parse_tier maneja mayúsculas/minúsculas
        let token = create_test_token("PRO", 3600);
        let info = validate_license(Some(&token));
        assert_eq!(info.tier, LicenseTier::Pro);
        assert!(info.is_valid);
    }
}