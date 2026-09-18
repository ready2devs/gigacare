//! Templates de evaluación de fotos

pub const EVALUATION_PROMPT: &str = r#"Analiza estas fotos de un grupo similar. Para cada una evalúa: nitidez (peso 40%), ojos abiertos en rostros (peso 30%), composición (peso 20%), ausencia de ruido (peso 10%). Devuelve exclusivamente un JSON con formato: {"analysis": [{"photo_index": 0, "sharpness": 0.85, "eyes_open": 0.92, "composition": 0.78, "noise_absence": 0.95, "total_weighted": 0.865, "reasoning": "..."}], "recommended_keep": [0], "recommended_discard": [1, 2]}"#;

pub fn calculate_weighted_score(sharpness: f64, eyes_open: f64, composition: f64, noise_absence: f64) -> f64 {
    (sharpness * 0.40) + (eyes_open * 0.30) + (composition * 0.20) + (noise_absence * 0.10)
}
