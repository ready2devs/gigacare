# Registro de Cambios (CHANGELOG) 📜

Todos los cambios notables de este proyecto se documentan en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.2.0] - 2026-10-05

### Añadido
- **Rediseño Integral de Cuidado Inteligente (SmartCare Redesign)**:
  - Pantalla de bienvenida con monitor animado SVG, indicador de último análisis y botón 'Analizar'.
  - Pantalla de escaneo activo con animación de disco giratorio (spin), ticker de archivos dinámico y botón de detención 'Detener'.
  - Panel de telemetría de disco estilo Jharu (`DriveHealthPanel`) con gráfico doughnut SVG, badges de salud SMART, métricas de hardware (temperatura, desgaste, sectores reasignados, horas de encendido) y pronóstico de llenado (`FillForecast`).
  - Tarjeta de limpieza (`CleanupCard`) con total de bytes recuperables y acceso a revisión detallada.
  - Barra de recuperación de espacio (`SpaceRecoveryBar`) con 3 segmentos porcentuales (ocupado permanente, recuperable en verde, libre).
  - Modal de revisión CleanMyMac (`CleanupReviewModal`) con 3 paneles verticales: categorías (180px), subcategorías/filtros (250px) y lista de archivos con checkboxes individuales y ordenamiento (tamaño, nombre, fecha).
  - Filtro estricto de seguridad: preselección y visualización por defecto exclusiva de elementos seguros (`safe: true`), excluyendo ítems riesgosos o de precaución.
  - Escaneo y limpieza de Papelera de Reciclaje con Win32 (`SHQueryRecycleBinW`) y parsing de `$Recycle.Bin`, enviando ítems a cuarentena preservando su ruta original.
  - Rastreo de actividad de aplicaciones mediante parsing de archivos Prefetch (`.pf`) y claves UserAssist decodificadas con ROT-13 en el Registro de Windows.
  - Persistencia de análisis en disco (`~/.gigacare/last_analysis.json`) y cache en memoria compartido con Space Map, Archivos Basura y Dev Cleaning.
  - Nueva sección 'Cuidado Inteligente' en Configuración (`SettingsPanel`) con controles para umbrales de inactividad, validez del cache y lectura SMART.
  - Internacionalización i18n completa en español (`es.json`) e inglés (`en.json`).

### Modificado
- **Shell y Módulos**:
  - Renombrado del módulo en la navegación a 'Cuidado Inteligente' con subtítulo 'Análisis y limpieza del sistema'.
  - Reemplazo de las tarjetas estáticas previas por la máquina de estados del flujo de análisis completo.
  - Actualización de versión de configuración a v2 con migración automática.

---
## [1.1.0] - 2026-09-20

### Añadido
- **Módulo Unificado "Archivos Basura" (Junk Files)**:
  - Orquestador de escaneo en Rust (`JunkFilesScanner`) con agrupación en 7 categorías: temporales de usuario/sistema, restos de Windows (SoftwareDistribution, WER, Windows.old), instaladores en descargas, cachés de navegadores, cachés de mensajería, residuales de aplicaciones y Prefetch.
  - Escáner especializado de cachés de navegadores (`BrowserScanner`) con detección de Chromium (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi) y Mozilla Firefox mediante parsing automático de `profiles.ini`.
  - Clasificación rigurosa de seguridad (`safe: true` para aislamiento reversible en 1-clic y `safe: false` con badge "Revisar" para ítems que requieren verificación del usuario).
  - Sección informativa y preventiva para Prefetch con advertencia de impacto en arranque y diálogo de precaución.
  - Banner interactivo de recomendación para cerrar navegadores en ejecución antes de la limpieza de cachés.
- **Módulo Unificado "Gestión del Sistema" (System Management)**:
  - Fusión integrada de **Desinstalador Profundo** e **Inicio de Windows** en un contenedor unificado con tabs de Fluent UI React v9 y preservación de estado de búsqueda/filtros entre pestañas.
  - Expansión de cobertura en desinstalación: detección en Registro HKLM/HKCU 64-bit, compatibilidad con aplicaciones de 32 bits vía `WOW6432Node`, y enumeración de aplicaciones UWP / MSIX de Microsoft Store mediante PowerShell `Get-AppxPackage`.
  - Badges informativos de fuente (`Registro`, `WOW64`, `UWP`, `Store`) en cada aplicación instalada.

### Modificado
- **Reestructuración de la Navegación (Shell)**:
  - Reducción limpia a 8 módulos principales: SmartCare, Cuarentena, Curador de Fotos, Archivos Basura, Gestión del Sistema, Space Map, Dev Cleaning y Configuración.
  - Eliminación de accesos independientes redundantes de "Desinstalador" e "Inicio de Windows".
  - Soporte de redirección transparente para deep-links legacy (`?module=uninstaller` y `?module=startup`).
  - Tarjetas de resumen de SmartCare interactivas con navegación directa a categorías de Archivos Basura con foco expandido.

### Calidad y Testing
- Suite de pruebas de escritorio ampliada a **48 archivos de test y 147 tests automatizados** (100% pasando en Vitest).
- Nuevos tests de integración en Rust para simulación de perfiles y cachés de navegadores (`browser_cache_test.rs`).

---

## [1.0.1] - 2026-09-19

### Añadido y Mejorado
- **Overhaul UX de SpaceMap / SpaceLens**:
  - Layout unificado de 4 zonas con barra superior de navegación e historial (Atrás/Adelante), lista de archivos filtrable, lienzo interactivo y barra de estado tipo CleanMyMac.
  - Visualizaciones interactivas **Treemap** (squarified), **Sunburst** (radial) y **Bubbles** (burbujas proporcionales) sincronizadas en tiempo real con filtros de selección (`Todos`, `Seleccionados`, `No seleccionados`) y checkboxes.
  - **Consultas en Lenguaje Natural (NLBar)** e **Inspector de Archivos** con barra de ahorro potencial (`SavingsBar`), triaje de duplicados y pestaña integrada de Cuarentena.
  - **Detección Nativa de Dispositivos MTP (WPD COM)** para explorar teléfonos y cámaras conectadas por USB en Windows, junto con selector nativo de carpetas.
- **Curador de Fotos y Videos con IA**:
  - Rediseño visual con anillos de calidad (`QualityRing`), barras de métricas (`MetricBar`), persistencia de `keep_count` (conservar 1, 2 o 3 mejores tomas) y detección de videos similares (`video_hasher`).
- **Nuevos Módulos y Crates Nativos en Rust**:
  - `gigacare-treemap`: Construcción jerárquica de árboles de almacenamiento y layouts de alta velocidad.
  - `gigacare-devcleaning`: Escaneo y limpieza especializada de cachés de compilación, modelos de IA locales, contenedores y entornos Python/Node/Rust.
  - `gigacare-registry`: Gestión segura de entradas de inicio de Windows (`StartupPanel`) y desinstalador profundo (`UninstallerPanel`).
- **Calidad y Testing**:
  - Suite ampliada a **41 archivos de test y 106 tests automatizados** (Vitest + React Testing Library) cubriendo flujos E2E, SpaceLens, Treemap, Sunburst, Curador de Fotos y Cuarentena.

---

## [1.0.0] - 2026-09-18

### Añadido
- **Módulos de Limpieza e Inspección (Core en Rust):**
  - `SmartCare`: Escaneo orquestado en paralelo de temporales, cachés de mensajería (WhatsApp, Telegram), dependencias de desarrollo inactivas (`node_modules`, `target`, `.venv`) e instaladores residuales.
  - `Cuarentena Reversible`: Aislamiento seguro de archivos con manifiesto versión 1, cálculo de checksum **SHA-256** previo al movimiento y restauración byte por byte en 1 clic.
  - `Curador de Fotos Inteligente`: Agrupación de ráfagas mediante hashing perceptual (**pHash**) y evaluación de calidad (nitidez por varianza laplaciana y espectro FFT 2D local, ojos abiertos, composición y ausencia de ruido).
  - `Space Map`: Visualizador interactivo de almacenamiento jerárquico con burbujas proporcionales y previsualizaciones flotantes con latencia <300ms.
  - `Desinstalador Profundo`: Detección de carpetas residuales y huérfanas en Windows y Android.
  - `Optimización de Inicio`: Gestión de aplicaciones con arranque automático (`RECEIVE_BOOT_COMPLETED` en Android / Registro de Windows).

- **Arquitectura de Inteligencia Artificial:**
  - Router multi-proveedor con balanceo round-robin para **Google AI Studio**, **FreeLLMAPI** y **Ollama** local.
  - Sistema de limitación de tasa (`governor`) y activación de cooldown automático de 60 segundos ante respuestas HTTP 429 Too Many Requests.
  - **Fallback Local Garantizado**: Métricas visuales por varianza Laplaciana y FFT 2D en caso de indisponibilidad de red o cuota agotada.

- **Clientes Multiplataforma:**
  - **Windows 11 Desktop Client**: Desarrollado con **Tauri 2.0**, **React 18**, **TypeScript** y **Fluent UI React v9**, implementando el tema **Obsidian Dark** con efectos translúcidos Mica y Acrylic.
  - **Android Mobile Client**: Desarrollado nativamente en **Kotlin** con **Jetpack Compose** y soporte para **Material You** (Dynamic Colors en Android 12+), enlazado mediante librerías compartidas generadas con Mozilla **UniFFI**.

- **Privacidad Radical y Seguridad:**
  - Cero placebos: Prohibición expresa de limpiadores agresivos de registro o task-killers de RAM.
  - La IA multimodal solo recibe miniaturas reducidas (≤512px, ≤100KB) bajo consentimiento explícito del usuario.
  - Previsualización obligatoria previa a toda acción destructiva.

- **Niveles de Licencia (Tiers):**
  - **Free (Gratuito)**: Limpieza del sistema, cuarentena (5 GB / 7 días), Space Map y curaduría local.
  - **BYOK (Bring Your Own Key)**: Habilita curaduría multimodal con clave API propia.
  - **Pro ($9.99 pago único)**: Escaneos programados en segundo plano, retención de 90 días (100 GB) y soporte para servidores gestionados.
