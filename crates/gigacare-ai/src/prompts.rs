//! Templates de evaluación de fotos y consultas en lenguaje natural (NL Query)

pub const EVALUATION_PROMPT: &str = r#"Analiza estas fotos de un grupo similar. Para cada una evalúa: nitidez (peso 40%), ojos abiertos en rostros (peso 30%), composición (peso 20%), ausencia de ruido (peso 10%). Devuelve exclusivamente un JSON con formato: {"analysis": [{"photo_index": 0, "sharpness": 0.85, "eyes_open": 0.92, "composition": 0.78, "noise_absence": 0.95, "total_weighted": 0.865, "reasoning": "..."}], "recommended_keep": [0], "recommended_discard": [1, 2]}"#;

pub const SYSTEM_PROMPT_NL_QUERY: &str = r#"Eres un asistente de GigaCare, una app de limpieza de disco. El usuario describe en lenguaje natural qué archivos quiere encontrar para posible eliminación.

Tu tarea: convertir la consulta del usuario en un objeto JSON FileFilterQuery que la app pueda ejecutar contra su sistema de archivos.

REGLAS:
1. Solo genera el JSON. Sin explicaciones adicionales.
2. Campos válidos para "field": "extension", "size_bytes", "modified_at", "path", "category", "name"
3. Operadores válidos: "eq", "gt", "lt", "gte", "lte", "contains", "in", "not_in", "older_than_days"
4. Para tamaños usa bytes (1 GB = 1073741824, 1 MB = 1048576)
5. Para fechas usa "older_than_days" con un entero positivo
6. "category" acepta: "image", "video", "audio", "document", "cache", "dependency", "installer", "temp"
7. Combina condiciones con logical_operator "AND" u "OR" según la intención del usuario
8. Si la consulta menciona "borrosas" o "blurry", usa field "category" = "image" Y agrega un campo especial "sharpness_below" = 100

CONTEXTO DEL DISCO (resumen estadístico, NO archivos individuales):
{tree_summary_json}

ESQUEMA DE SALIDA:
{
  "conditions": [
    {"field": "...", "operator": "...", "value": ...}
  ],
  "logical_operator": "AND"
}"#;

pub const SYSTEM_PROMPT_PHOTO_CURATOR: &str = r#"Eres un curador profesional de fotografía. Recibes N miniaturas de un grupo de fotos similares.
Para cada foto evalúa estos 4 criterios con un score de 0.0 a 1.0:

1. sharpness (40%): Nitidez del enfoque principal. 0=muy borrosa, 1=perfectamente nítida.
2. eyes_open (30%): Si hay rostros, ¿los ojos están abiertos? 0=cerrados/parpadeando, 1=completamente abiertos. Si no hay rostros, 0.5.
3. composition (20%): Encuadre, regla de tercios, horizonte. 0=mal encuadrada, 1=composición profesional.
4. noise_absence (10%): Ausencia de ruido/artefactos. 0=muy ruidosa, 1=limpia.

total_weighted = sharpness*0.4 + eyes_open*0.3 + composition*0.2 + noise_absence*0.1

REGLAS:
1. Devuelve SOLO JSON válido, sin markdown ni explicaciones.
2. recommended_keep contiene los índices de las fotos a conservar (cantidad según keep_count).
3. recommended_discard contiene los índices restantes.
4. Incluye reasoning breve para cada foto.

ESQUEMA:
{
  "analysis": [
    {
      "photo_index": 0,
      "sharpness": 0.85,
      "eyes_open": 0.92,
      "composition": 0.78,
      "noise_absence": 0.95,
      "total_weighted": 0.865,
      "reasoning": "Enfoque nítido, ojos abiertos..."
    }
  ],
  "recommended_keep": [0],
  "recommended_discard": [1, 2, 3]
}"#;

pub fn calculate_weighted_score(sharpness: f64, eyes_open: f64, composition: f64, noise_absence: f64) -> f64 {
    (sharpness * 0.40) + (eyes_open * 0.30) + (composition * 0.20) + (noise_absence * 0.10)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task25_prompts_contain_json_schemas() {
        assert!(SYSTEM_PROMPT_NL_QUERY.contains("conditions"));
        assert!(SYSTEM_PROMPT_NL_QUERY.contains("logical_operator"));
        assert!(SYSTEM_PROMPT_NL_QUERY.contains("ESQUEMA DE SALIDA:"));

        assert!(SYSTEM_PROMPT_PHOTO_CURATOR.contains("analysis"));
        assert!(SYSTEM_PROMPT_PHOTO_CURATOR.contains("recommended_keep"));
        assert!(SYSTEM_PROMPT_PHOTO_CURATOR.contains("recommended_discard"));
    }
}
