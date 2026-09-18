# Referencia de API: GigaCare (Tauri IPC & UniFFI) 📡

Este documento proporciona la especificación completa de los comandos Tauri IPC invocables desde el frontend de escritorio, así como la interfaz UniFFI exportada para el cliente Android.

---

## 🖥️ Parte 1: Comandos Tauri IPC (Windows Desktop)

Todos los comandos se invocan mediante `invoke<T>(command, args)` desde `@tauri-apps/api/core`.

### 1. Escaneo y Limpieza del Sistema (Smart Care)

#### `scan_smart_care`
Inicia el escaneo integral de todos los módulos del sistema emitiendo eventos `scan-progress`.
- **Entrada:** `{}`
- **Salida:** `ScanResult`
```typescript
const result = await invoke<ScanResult>("scan_smart_care");
console.log("Recuperable:", result.total_recoverable_bytes);
```

#### `cancel_scan`
Cancela de forma cooperativa e instantánea el escaneo en progreso.
- **Entrada:** `{}`
- **Salida:** `void`

#### `clean_items`
Mueve una lista seleccionada de archivos a la cuarentena reversible.
- **Entrada:** `{ item_ids: string[] }`
- **Salida:** `CleanResult`
```typescript
const result = await invoke<CleanResult>("clean_items", {
  item_ids: ["C:\\Users\\Demo\\AppData\\Local\\Temp\\dump.tmp"]
});
```

#### `preview_clean`
Retorna un resumen de previsualización con el conteo de elementos y el tamaño total.
- **Entrada:** `{ item_ids: string[] }`
- **Salida:** `CleanPreview`

---

### 2. Cuarentena Reversible (Aislamiento Seguro)

#### `list_quarantine`
Obtiene la lista cronológica de todos los archivos aislados en cuarentena.
- **Entrada:** `{}`
- **Salida:** `QuarantineEntry[]`

#### `restore_items`
Restaura archivos aislados a su ruta original con verificación criptográfica SHA-256.
- **Entrada:** `{ entry_ids: string[] }`
- **Salida:** `RestoreResult`

#### `purge_expired`
Elimina definitivamente aquellos archivos cuya retención ha superado el límite (7 a 90 días).
- **Entrada:** `{}`
- **Salida:** `PurgeResult`

#### `quarantine_stats`
Devuelve las estadísticas actuales de uso de disco de la cuarentena.
- **Entrada:** `{}`
- **Salida:** `QuarantineStats` (`{ total_items, total_bytes, max_space_bytes }`)

---

### 3. Curador de Fotos Inteligente

#### `find_photo_groups`
Escanea directorios de fotos y las agrupa por similitud perceptual usando pHash.
- **Entrada:** `{ max_distance?: number }`
- **Salida:** `PhotoGroup[]`

#### `analyze_group_ai`
Evalúa estéticamente un grupo específico mediante el router multi-proveedor o fallback local.
- **Entrada:** `{ group_id: string }`
- **Salida:** `PhotoGroup`

#### `analyze_all_groups_ai`
Analiza en lote todos los grupos detectados emitiendo eventos de progreso.
- **Entrada:** `{}`
- **Salida:** `PhotoGroup[]`

---

### 4. Space Map (Explorador de Almacenamiento)

#### `build_space_map`
Genera el árbol jerárquico de carpetas y archivos con pesos para las burbujas proporcionales.
- **Entrada:** `{ root_path: string, max_depth?: number }`
- **Salida:** `SpaceMapNode` (`{ name, path, size_bytes, is_directory, children }`)

---

### 5. Configuración y Licencias

#### `get_config` / `update_config`
Lectura y escritura del modelo de configuración persistente `config.json`.
- **Entrada `update_config`:** `{ config: AppConfig }`
- **Salida:** `AppConfig`

#### `validate_api_key`
Comprueba la validez de una clave BYOK (Google AI Studio / FreeLLMAPI).
- **Entrada:** `{ provider: string, key: string }`
- **Salida:** `ValidationResult` (`{ valid: boolean, message: string }`)

#### `export_config` / `import_config`
Exportación e importación de la configuración completa en formato JSON.

#### `validate_license` / `activate_license`
Gestión y verificación del token de licencia Pro mediante HMAC-SHA256.
- **Entrada `activate_license`:** `{ token: string }`
- **Salida:** `LicenseInfo` (`{ tier, expires_at, is_valid }`)

---

## 📱 Parte 2: Bindings UniFFI (Kotlin / Android)

La clase `GigaCareCore` es exportada por `gigacare_uniffi` para interacción directa desde Kotlin en corrutinas:

```kotlin
class GigaCareCore(quarantinePath: String) {
    fun getConfig(): String
    fun updateConfig(json: String)
    fun scanSmartCare(callback: FfiScanCallback?): FfiScanResult
    fun cleanItems(itemPaths: List<String>): FfiCleanResult
    fun getQuarantineStats(): FfiQuarantineStats
    fun findPhotoGroups(maxHammingDistance: UInt): List<FfiPhotoGroup>
    fun validateLicense(token: String?): String
}

interface FfiScanCallback {
    fun onProgress(module: String, percent: Float, bytesFound: ULong)
}
```

### Ejemplo de Uso en Kotlin (Coroutines + Flow):
```kotlin
val bridge = RustBridge(context.filesDir)

// Escaneo asíncrono con recepción de progreso en tiempo real
viewModelScope.launch {
    bridge.progressFlow.collect { event ->
        println("Módulo ${event.module}: ${event.percent}% (${event.bytesFound} bytes)")
    }
}
val scanResult = bridge.scanSmartCare()
```
