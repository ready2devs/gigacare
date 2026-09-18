# Arquitectura del Sistema: GigaCare 🏛️

Este documento describe la arquitectura modular, el diagrama de capas en capas de abstracción, el flujo de datos unidireccional y las decisiones arquitectónicas fundamentales (**DA-001** a **DA-008**).

---

## 📊 1. Diagrama de Capas del Sistema (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPA DE PRESENTACIÓN (UI)                             │
├──────────────────────────────────────┬──────────────────────────────────────┤
│       Windows 11 Desktop Client      │        Android Mobile Client         │
│  Tauri 2.0 • React 18 • TypeScript   │  Kotlin • Jetpack Compose • UI M3    │
│  Fluent UI React v9 (Obsidian Dark)  │  Material You (Dynamic Colors S+)    │
│  react-i18next (es / en)             │  LocaleHelper (es / en)              │
└──────────────────┬───────────────────┴──────────────────┬───────────────────┘
                   │ IPC Commands                         │ UniFFI (Kotlin FFI)
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  CAPA DE ORQUESTACIÓN Y ENLACE NATIVO                       │
├──────────────────────────────────────┬──────────────────────────────────────┤
│       src-tauri IPC Handlers         │          gigacare-uniffi             │
│   AppState • Streaming Event Emitter │   GigaCareCore Object • Mutex/Flow   │
└──────────────────┬───────────────────┴──────────────────┬───────────────────┘
                   │                                      │
                   └──────────────────┬───────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NÚCLEO EN RUST (gigacare-core)                           │
│  Scanner Orchestrator • Streaming Progress Events • Clean Engine            │
│  SystemScanner • MessagingScanner • DevDepsScanner • PhotoDuplicatesScanner  │
├──────────────────┬───────────────────┬──────────────────┬───────────────────┤
│ gigacare-config  │gigacare-quarantine│ gigacare-vision  │   gigacare-ai     │
│ Persistent JSON  │ Manifest v1       │ Laplacian Var    │ Multi-Provider    │
│ Config Models    │ SHA-256 Checksum  │ 2D FFT Spectrum  │ Rate Limiter 429  │
│ Exclusions & BYOK│ Reversible Move   │ Adaptive Thumb   │ Local Fallback    │
├──────────────────┴───────────────────┴──────────────────┴───────────────────┤
│                   gigacare-hash & gigacare-fs & gigacare-license            │
│ Cryptographic SHA-256 • Perceptual pHash • Safe File I/O • HMAC License     │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ System Calls
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SISTEMA OPERATIVO Y ALMACENAMIENTO                      │
│      Windows 11 (Win32 / NTFS)        │        Android (SAF / Linux)        │
│   %TEMP% • Prefetch • Program Files   │ /storage/emulated/0 • Shizuku/Root  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 2. Flujo de Datos: Escaneo → Previsualización → Cuarentena

El flujo de datos sigue una política de **cero eliminación destructiva directa** y **previsualización obligatoria**:

```
[ Usuario: Iniciar Smart Care ]
               │
               ▼
[ Scanner Orchestrator ] ──── Emisión de eventos ────► [ UI: Barra de progreso ]
               │             ("scan-progress")
        Iteración y Filtros (Antigüedad, Tamaño)
               │
               ▼
   [ ScanResult Consolidado ]
               │
               ▼
[ UI: PREVISUALIZACIÓN OBLIGATORIA (PreviewPanel) ] ◄── Requisito RF-803
               │
         Selección manual de archivos
               │
               ▼
[ Diálogo de Confirmación (ConfirmDialog) ] ◄──────── Doble acción explícita
               │
               ▼
[ QuarantineManager: quarantine_file() ]
   1. Cálculo de SHA-256 pre-aislamiento
   2. Creación de subcarpeta aislada (.gigacare/quarantine/files/{id}/)
   3. Movimiento reversible del archivo original
   4. Actualización atómica de manifest.json (QuarantineManifest v1)
   5. Verificación de cuota de espacio (límite 5 GB / 80% alerta)
               │
               ▼
[ Almacenamiento Seguro ] ──► Disponible para Restauración 1-clic durante 7-90 días
```

---

## ⚖️ 3. Decisiones Arquitectónicas Fundamentales (DA-001 a DA-008)

- **DA-001: Monorepo Modular Cargo Workspace con Separación Estricta de Crates.**
  - *Razón:* Reutilización máxima del código de negocio entre Windows y Android sin duplicar algoritmos de hashing, visión o licencias.
- **DA-002: Tauri 2.0 sobre Electron para el Cliente de Escritorio.**
  - *Razón:* Binarios ultraligeros (~15MB vs ~150MB), consumo de RAM inferior a 80MB y comunicación IPC tipada y sin sobrecostes.
- **DA-003: Mozilla UniFFI para la Generación de Bindings Android/Kotlin.**
  - *Razón:* Genera wrappers Kotlin con tipos nativos seguros, evitando código JNI manual propenso a fugas de memoria.
- **DA-004: Cuarentena Reversible con Integridad Criptográfica SHA-256.**
  - *Razón:* Garantía absoluta de restauración byte por byte. Protege al usuario de eliminaciones accidentales de archivos vitales.
- **DA-005: Curaduría Híbrida: Perceptual pHash Local + IA Multimodal Adaptativa.**
  - *Razón:* Detección rápida y offline de duplicados mediante distancia Hamming, reservando llamadas a LLM solo para evaluación estética.
- **DA-006: Privacidad Radical en Análisis IA (Miniaturas ≤512px, ≤100KB).**
  - *Razón:* Cumplimiento de estándares de privacidad: nunca se envían fotos de alta resolución ni metadatos personales a la nube.
- **DA-007: Router Multi-Proveedor con Rate Limiting y Fallback Local Automático.**
  - *Razón:* Tolerancia total a fallos. Si Google AI o FreeLLM devuelven HTTP 429, se activa cooldown de 60s y fallback local por FFT/Laplaciano.
- **DA-008: Licenciamiento Descentralizado con Tokens HMAC-SHA256 (Offline First).**
  - *Razón:* Validación instantánea de licencias Pro sin requerir conexión constante a servidores externos de autenticación.

---

## 🗺️ 4. Mapa de Crates y Dependencias

| Crate | Responsabilidad | Dependencias Principales |
| :--- | :--- | :--- |
| `gigacare-core` | Orquestador de escaneo, modelos y eventos | tokio, walkdir, chrono, serde |
| `gigacare-config` | Carga, validación y persistencia de config.json | serde_json, directories |
| `gigacare-quarantine` | Gestión de cuarentena reversible y manifiesto v1 | sha2, chrono, serde |
| `gigacare-vision` | Varianza Laplaciana, FFT 2D y miniaturas | image, rustfft, zune-jpeg |
| `gigacare-ai` | Router de IA, rate limiter y clientes HTTP | reqwest, governor, serde_json |
| `gigacare-hash` | Checksums SHA-256 y perceptual hashing pHash | sha2, image_hasher |
| `gigacare-license` | Generación y verificación de tokens de licencia | hmac, sha2, base64 |
| `gigacare-fs` | Escaneo seguro con exclusión de enlaces simbólicos | walkdir, fs_extra |
| `gigacare-uniffi` | Exportación de interfaces FFI para Android | uniffi, tokio |
