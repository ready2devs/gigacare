# GigaCare — Suite de Optimización para Windows 11 & Android

[![CI](https://github.com/ready2devs/gigacare/actions/workflows/ci.yml/badge.svg)](https://github.com/ready2devs/gigacare/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**GigaCare** es una herramienta de optimización de almacenamiento y rendimiento para **Windows 11** y **Android**, con un enfoque en privacidad radical y transparencia total.

## Características Principales

- 🧹 **Smart Care** — Escaneo inteligente con un clic: cachés de mensajería, dependencias de desarrollo, temporales del sistema, instaladores residuales.
- 🗑️ **Desinstalador Profundo** — Detecta y limpia residuales huérfanos post-desinstalación.
- 🚀 **Gestor de Inicio** — Controla elementos de arranque con clasificación de impacto.
- 🗺️ **Mapa de Espacio** — Visualización interactiva del almacenamiento con previsualizaciones flotantes.
- 📸 **Curador de Fotos IA** — Detecta duplicados similares y evalúa calidad con IA multimodal (Google AI, FreeLLMAPI, Ollama).
- 🔒 **Cuarentena Segura** — Todo borrado pasa por cuarentena con verificación SHA-256 y restauración garantizada.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Core** | Rust (workspace de crates) |
| **Desktop** | Tauri 2 + React + TypeScript + Fluent UI v9 |
| **Android** | Kotlin + Jetpack Compose + Material 3 + UniFFI |
| **IA** | Google AI Studio, FreeLLMAPI, Ollama (round-robin con fallback) |

## Estructura del Monorepo

```
gigacare/
├── crates/                  # Core Rust compartido
│   ├── gigacare-core/       # Orquestador principal
│   ├── gigacare-fs/         # Motor de recorrido de archivos
│   ├── gigacare-hash/       # SHA-256 + pHash/dHash
│   ├── gigacare-vision/     # Análisis de nitidez y miniaturas
│   ├── gigacare-ai/         # Cliente IA round-robin
│   ├── gigacare-quarantine/ # Sistema de cuarentena
│   ├── gigacare-config/     # Configuración persistente
│   ├── gigacare-license/    # Validación de licencia JWT
│   └── gigacare-uniffi/     # Bindings FFI para Android
├── apps/
│   ├── desktop/             # App Windows (Tauri 2 + React)
│   └── android/             # App Android (Kotlin + Compose)
├── docs/                    # Documentación técnica
└── .github/workflows/       # CI/CD
```

## Niveles de Licencia

| Nivel | Funcionalidades |
|-------|----------------|
| **Free** | Smart Care, Desinstalador, Startup Manager, Space Map, Cuarentena |
| **BYOK** | Todo Free + Curador de Fotos IA (con tu propia API key) |
| **Pro** | Todo BYOK + Escaneos programados, cuota IA incluida |

## Requisitos de Build

- **Rust** >= 1.75 (stable)
- **Node.js** >= 18 (para el frontend React)
- **Android SDK** (API 26-34) + NDK (para la app Android)
- **Tauri CLI** v2

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para instrucciones detalladas de setup.

## Licencia

[MIT](LICENSE)