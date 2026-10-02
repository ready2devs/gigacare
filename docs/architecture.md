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

---

## 🗑️ 5. Arquitectura de Archivos Basura y Gestión del Sistema (Spec 007)

### 5.1 Diagrama de Flujo: Orquestador de Archivos Basura (Junk Files)

```
                     ┌────────────────────────────────────┐
                     │         JunkFilesScanner           │
                     │  (Orquestador Unificado en Rust)   │
                     └─────────────────┬──────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  SystemScanner   │          │  BrowserScanner  │          │ MessagingScanner │
│  - Temp Usuario  │          │  - Chrome        │          │  - WhatsApp      │
│  - Temp Sistema  │          │  - Edge          │          │  - Telegram      │
│  - WER Dumps     │          │  - Brave         │          │  - Discord       │
│  - Delivery Opt  │          │  - Opera         │          └──────────────────┘
│  - Windows.old   │          │  - Vivaldi       │                   │
│  - Prefetch (inf)│          │  - Firefox (ini) │                   │
└────────┬─────────┘          └────────┬─────────┘                   │
         │                             │                             │
         └─────────────────────────────┼─────────────────────────────┘
                                       ▼
                     ┌────────────────────────────────────┐
                     │      Clasificación de Seguridad    │
                     │  • safe: true (Cuarentena 1-clic)  │
                     │  • safe: false / review (Requiere  │
                     │    confirmación expresa o warning) │
                     └─────────────────┬──────────────────┘
                                       ▼
                     ┌────────────────────────────────────┐
                     │       JunkFilesScanResult (IPC)    │
                     │  • total_junk_bytes                │
                     │  • categories: [JunkCategory]      │
                     └────────────────────────────────────┘
```

### 5.2 Estructura del Módulo Gestión del Sistema (System Management)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 SystemManagementPanel (Contenedor con Tabs)                 │
├──────────────────────────────────────┬──────────────────────────────────────┤
│    Tab 1: Desinstalador Profundo     │      Tab 2: Inicio de Windows        │
│    (UninstallerPanel)                │      (StartupPanel)                  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Detección 360° de aplicaciones:    │ • Control de programas de arranque   │
│   - Registro HKLM/HKCU (64-bit)      │ • Fuentes: Registros HKCU, HKLM y    │
│   - WOW6432Node (32-bit legacy)      │   carpeta shell:startup              │
│   - Aplicaciones UWP / AppX          │ • Clasificación de impacto (Alto,    │
│ • Rastreo de residuos en AppData/Reg │   Medio, Bajo)                       │
│ • Desinstalación y limpieza          │ • Protección de servicios críticos   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### 5.3 Mapa Actualizado de Módulos (Shell de 8 Módulos)

1. **SmartCare** (`smartcare`): Diagnóstico y escaneo central del sistema con acceso rápido mediante tarjetas de resumen interactivas.
2. **Cuarentena** (`quarantine`): Aislamiento seguro y reversible con retención programada e inspección por carpetas.
3. **Curador de Fotos** (`photos`): Detección local con pHash + filtrado de nitidez por FFT e inferencia opcional IA.
4. **Archivos Basura** (`junk_files`): Escaneo profundo de temporales, cachés de navegadores, restos de Windows y mensajería con clasificación de seguridad.
5. **Gestión del Sistema** (`system_management`): Panel unificado que agrupa Desinstalador Profundo e Inicio de Windows con preservación de estado entre pestañas.
6. **Space Map** (`space_map`): Explorador visual de almacenamiento jerárquico (burbujas, treemap y sunburst) y consultas en lenguaje natural.
7. **Dev Cleaning** (`dev_cleaning`): Detección y limpieza de entornos de desarrollo (`node_modules`, venv, pip, Gradle, Cargo).
8. **Configuración** (`settings`): Ajustes de retención, tema, licencias y preferencias globales.

---

## 6. Módulo Cuidado Inteligente (SmartCare Redesign)

A partir de la especificación **008-smartcare-redesign**, SmartCare evoluciona de tarjetas estáticas a un flujo completo y autónomo de diagnóstico, salud de disco y limpieza profunda inspirado en la elegancia de **CleanMyMac** y la telemetría de **Jharu**.

### 6.1 Flujo y Máquina de Estados

- **Welcome (SmartCareWelcome)**: Monitor 3D con halo pulsante SVG, indicador de último análisis y botón circular 'Analizar'.
- **Scanning (SmartCareScanning)**: Disco giratorio SVG, ticker animado con rutas de archivo reales, barra de progreso por etapas y botón 'Detener' cooperativo.
- **Results (SmartCareResults)**: Panel superior de Salud del Disco (DriveHealthPanel), tarjeta con total recuperable (CleanupCard), botón circular Ejecutar y barra proporcional de recuperación (SpaceRecoveryBar).
- **Review (CleanupReviewModal)**: Modal CleanMyMac de 3 paneles verticales (Categorías 180px, Subcategorías 250px, Lista de archivos con ordenamiento y checkboxes individuales) con filtrado estricto de seguridad.
- **Execution**: Aislamiento a cuarentena con `clean_items` y `clean_recycle_bin`, confirmación individual para desinstalación de aplicaciones y resumen post-ejecución.

### 6.2 Componentes Nuevos

- `SmartCareWelcome.tsx`: Pantalla de bienvenida con monitor animado SVG y tiempo transcurrido desde el último escaneo.
- `SmartCareScanning.tsx`: Animación de escaneo continuo con disco giratorio, ticker de archivos y eventos Tauri en tiempo real.
- `SmartCareResults.tsx`: Vista de resultados que ensambla salud del disco, total recuperable, botón de ejecución y barra de recuperación.
- `DriveHealthPanel.tsx`: Panel estilo Jharu con gráfico doughnut SVG, badges de estado SMART, barras de hardware (temperatura, desgaste, sectores reasignados) y pronóstico de llenado de disco.
- `CleanupCard.tsx`: Tarjeta de resumen con tamaño recuperable total y disparador de revisión.
- `SpaceRecoveryBar.tsx`: Barra tricolor de 3 segmentos que representa espacio ocupado permanente, recuperable y libre.
- `CleanupReviewModal.tsx`: Gestor de limpieza con navegación lateral por 4 categorías (Archivos basura, Limpieza Dev, Apps sin uso, Multimedia), filtros temporales y ordenamiento.
- `ReviewCategoryList.tsx`, `ReviewSubcategoryList.tsx`, `ReviewFileList.tsx`: Componentes desacoplados de los 3 paneles internos de revisión.

### 6.3 Persistencia y Estado Compartido entre Módulos

El análisis integral (`SmartCareAnalysis`) se persiste de forma durable en `~/.gigacare/last_analysis.json` y se mantiene en memoria en `AppState.smartcare_analysis`. Si el análisis es reciente (menor a `analysis_cache_hours` configurado):
- **Space Map**: Salta la bienvenida e inicializa directamente el treemap de la unidad principal.
- **Archivos Basura (Junk Files)**: Muestra inmediatamente el resumen categorizado sin forzar un re-escaneo.
- **Dev Cleaning**: Despliega directamente los hallazgos de cachés de desarrollo.

### 6.4 Comandos Tauri IPC Añadidos

- `get_drive_health`: Consulta WMI para telemetría física del disco y cálculo de pronóstico de llenado.
- `scan_recycle_bin`: Inspecciona `$Recycle.Bin` y encabezados Win32.
- `clean_recycle_bin`: Envía ítems de la papelera a cuarentena conservando la ruta original de restauración.
- `get_app_usage` / `list_installed_apps_with_usage`: Analiza Prefetch y UserAssist (ROT-13) para determinar el último uso y conteo de ejecuciones de programas.
- `get_smartcare_analysis` / `save_smartcare_analysis`: Lee y persiste el análisis en disco.
- `run_full_smartcare_analysis`: Ejecuta el pipeline completo de análisis en segundo plano emitiendo eventos de progreso.
- `cancel_scan`: Cancela cooperativamente el análisis en curso.

