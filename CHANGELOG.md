# Registro de Cambios (CHANGELOG) 📜

Todos los cambios notables de este proyecto se documentan en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
