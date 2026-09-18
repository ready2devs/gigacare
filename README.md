# GigaCare 🚀
> Suite de Optimización Integral, Limpieza Reversible y Curaduría Visual con IA para **Windows 11** y **Android**.

[![CI - GigaCare Verification & Build Pipeline](https://github.com/luccabb/gigacare-app/actions/workflows/ci.yml/badge.svg)](https://github.com/luccabb/gigacare-app/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust: 1.80+](https://img.shields.io/badge/Rust-1.80%2B-orange.svg)](https://www.rust-lang.org)
[![Tauri: 2.0](https://img.shields.io/badge/Tauri-2.0-blueviolet.svg)](https://tauri.app)
[![Android: API 26+](https://img.shields.io/badge/Android-API%2026%2B-green.svg)](https://developer.android.com)

---

## 🌟 Visión General

**GigaCare** redefine el mantenimiento del sistema operativo combinando el rendimiento nativo de bajo nivel en **Rust**, la elegancia visual de **Obsidian Dark & Material You**, y el poder de la **Inteligencia Artificial Multimodal** para la curaduría inteligente de fotografías y la gestión del almacenamiento.

A diferencia de herramientas convencionales, GigaCare sigue principios estrictos:
1. **Cero Placebos:** Sin limpiadores agresivos de registro en Windows ni task-killers de RAM en Android.
2. **Privacidad Radical:** El análisis de archivos es estrictamente local. La IA multimodal externa solo recibe previsualizaciones reducidas (≤512px, ≤100KB) en lotes bajo demanda explícita.
3. **Aislamiento Reversible:** Todo archivo marcado para limpieza pasa por una cuarentena segura con integridad criptográfica **SHA-256**, permitiendo restauración inmediata en 1 clic durante 7 a 90 días.
4. **Previsualización Obligatoria:** Pantalla interactiva previa antes de cualquier acción destructiva.

---

## 📸 Capturas de Pantalla (Visual Showcase)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GigaCare v1.0.0                      [ SmartCare ] [ Cuarentena ] [ Fotos ] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                (   Smart Care   )                            │
│                                  Escanear Sistema                           │
│                                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│   │ Archivos Temporales  │  │ Caché de Mensajería  │  │ Curador de Fotos  │  │
│   │ 1.45 GB recuperable  │  │ WhatsApp & Telegram  │  │ 12 grupos pHash   │  │
│   └──────────────────────┘  └──────────────────────┘  └───────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Arquitectura y Stack Tecnológico

El proyecto está estructurado como un monorepo modular:

- **Núcleo Nativo en Rust (`crates/`):**
  - `gigacare-core`: Orquestador principal, eventos en tiempo real y API `scan_smart_care`.
  - `gigacare-config`: Modelo de configuración persistente (`config.json`).
  - `gigacare-quarantine`: Cuarentena reversible, manifiesto v1 y hashing SHA-256.
  - `gigacare-vision`: Métricas de nitidez local (Varianza Laplaciana, FFT 2D) y miniaturas adaptativas.
  - `gigacare-ai`: Router round-robin con rate limiting, cooldown ante HTTP 429 y fallback local.
  - `gigacare-license`: Validación de licencias HMAC-SHA256 y control de funciones por nivel.
  - `gigacare-uniffi`: Generación de bindings Kotlin para Android mediante Mozilla UniFFI.

- **Aplicación de Escritorio (`apps/desktop/`):**
  - **Tauri 2.0** + **React 18** + **TypeScript** + **Vite**.
  - **Fluent UI React v9** con tema **Obsidian Dark** (#0B0F19, #00E5FF, #7C3AED) y efectos Mica/Acrylic.
  - Internacionalización completa con **react-i18next** (Español / Inglés).

- **Aplicación Móvil (`apps/android/`):**
  - **Kotlin** + **Jetpack Compose** + **Material You** (Dynamic Colors en Android 12+).
  - Integración UniFFI con carga de librerías compartidas nativas (`.so`).
  - Detección de residuales huérfanos, soporte SAF y degradación silenciosa con Shizuku/Root.

---

## 💎 Niveles de Licencia (Tiers)

| Característica | Free (Gratuito) | BYOK (Bring Your Own Key) | Pro ($9.99 pago único) |
| :--- | :---: | :---: | :---: |
| Limpieza Smart Care (Temporales, Caché) | ✅ | ✅ | ✅ |
| Cuarentena Reversible SHA-256 | ✅ (5 GB / 7 días) | ✅ (10 GB / 14 días) | ✅ (100 GB / 90 días) |
| Space Map interactivo | ✅ | ✅ | ✅ |
| Curador de Fotos (Nitidez local FFT/Laplace) | ✅ | ✅ | ✅ |
| Curador con IA Multimodal (Google AI / FreeLLM) | ❌ | ✅ (Clave propia) | ✅ (Servidor Gestionado) |
| Escaneos Programados en Segundo Plano | ❌ | ❌ | ✅ |
| Desinstalador Profundo con Eliminación Residual | ✅ | ✅ | ✅ |

---

## 🚀 Guía de Compilación e Instalación

### Prerrequisitos Globales
- **Rust Toolchain**: 1.80 o superior (`rustup default stable`).
- **Node.js**: v20+ y gestor de paquetes **pnpm** (`npm install -g pnpm`).
- **Visual Studio Build Tools 2022** con componentes C++ (en Windows).
- **Android Studio / Android NDK r25+** (para compilación móvil).

### 1. Compilar y Ejecutar la Aplicación de Escritorio (Windows)
```bash
cd apps/desktop
pnpm install
pnpm test          # Ejecutar suite de pruebas E2E con vitest
pnpm tauri dev     # Iniciar en modo desarrollo con HMR
pnpm tauri build   # Generar instalador MSI / EXE listo para producción
```

### 2. Compilar Crates Nativos de Rust
```bash
cd crates
cargo test --workspace
cargo test -p gigacare-core --test integration_tests --features integration
```

### 3. Compilar la Aplicación Android
```bash
# Generar librerías nativas con NDK
cd crates
./build-android.bat

# Ensamblar APK de Android
cd ../apps/android
./gradlew assembleDebug
```

---

## 📄 Licencia

Este proyecto está licenciado bajo los términos de la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.
