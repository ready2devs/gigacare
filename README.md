<div align="center">

# GigaCare 🚀

**Suite de Optimización de Alto Rendimiento, Limpieza Reversible y Curaduría Visual con IA.**  
*Diseñada exclusivamente para **Windows 11** y **Android** con arquitectura nativa en Rust.*

[![CI](https://github.com/ready2devs/gigacare/actions/workflows/ci.yml/badge.svg)](https://github.com/ready2devs/gigacare/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/ready2devs/gigacare?color=00E5FF&logo=github)](https://github.com/ready2devs/gigacare/releases/latest)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri&logoColor=white)](https://tauri.app)
[![Android](https://img.shields.io/badge/Android-API%2026%2B-3DDC84?logo=android&logoColor=white)](https://developer.android.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[Descargar Releases](https://github.com/ready2devs/gigacare/releases/latest)** · **[Arquitectura](docs/architecture.md)** · **[API Reference](docs/api-reference.md)** · **[Reporte de Verificación](docs/verification-report.md)**

<p align="center">
  <a href="https://github.com/ready2devs/gigacare/releases/latest">
    <img src="https://img.shields.io/badge/Windows_11_Installer-Descargar_.MSI-0078D4?style=for-the-badge&logo=windows11&logoColor=white" height="42" alt="Descargar Windows MSI">
  </a>
  &nbsp;
  <a href="https://github.com/ready2devs/gigacare/releases/latest">
    <img src="https://img.shields.io/badge/Windows_Portable-Descargar_.EXE-00E5FF?style=for-the-badge&logo=windows&logoColor=0B0F19" height="42" alt="Descargar Windows Portable">
  </a>
  &nbsp;
  <a href="https://github.com/ready2devs/gigacare/releases/latest">
    <img src="https://img.shields.io/badge/Android_App-Descargar_.APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" height="42" alt="Descargar Android APK">
  </a>
</p>

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

</div>

---

## 📥 ¿Dónde están los Ejecutables e Instaladores?

Puedes obtener los instaladores listos para usar de dos maneras: directamente desde las **Releases Oficiales de GitHub** o generándolos localmente en tu máquina.

### 1. Descarga Directa (Recomendada para Usuarios)
En cada lanzamiento oficial en GitHub, los archivos binarios compilados están disponibles en la sección [**GitHub Releases (Última Versión)**](https://github.com/ready2devs/gigacare/releases/latest):

| Plataforma | Tipo de Instalación | Nombre del Archivo | Descripción |
| :--- | :--- | :--- | :--- |
| **Windows 11 / 10** | Instalador Guiado | [`GigaCare-v1.0.0-x64-setup.msi`](https://github.com/ready2devs/gigacare/releases/latest) | Asistente de instalación estándar para Windows (menú inicio, accesos directos y desinstalador limpio). |
| **Windows 11 / 10** | Portable (Sin instalación) | [`GigaCare-v1.0.0-portable.exe`](https://github.com/ready2devs/gigacare/releases/latest) | Ejecutable autónomo sin instalación. Ideal para llevar en un pendrive o ejecutar sin permisos de administrador. |
| **Android (API 26+)**| Paquete de Aplicación | [`gigacare-v1.0.0-universal.apk`](https://github.com/ready2devs/gigacare/releases/latest) | Archivo APK universal para instalar directamente en teléfonos o tablets Android (arquitecturas ARM64, ARMv7, x86_64). |

---

### 2. Ubicación de los Ejecutables al Compilar en Local
Si estás clonando el repositorio y construyendo el proyecto desde el código fuente, los archivos generados se ubican en:

#### 🖥️ Para Windows (Tauri 2.0 Desktop):
- **Instalador MSI:**  
  📁 `apps/desktop/src-tauri/target/release/bundle/msi/GigaCare_1.0.0_x64_en-US.msi`
- **Instalador NSIS / Portable:**  
  📁 `apps/desktop/src-tauri/target/release/bundle/nsis/GigaCare_1.0.0_x64-setup.exe`
- **Binario compilado directo:**  
  📁 `apps/desktop/src-tauri/target/release/gigacare-desktop.exe`

> *Comando para generarlos:*  
> ```powershell
> cd apps/desktop
> pnpm install
> pnpm tauri build
> ```

#### 📱 Para Android (Kotlin + NDK + Compose):
- **APK Debug:**  
  📁 `apps/android/app/build/outputs/apk/debug/app-debug.apk`
- **APK Release (Optimizado con R8/ProGuard):**  
  📁 `apps/android/app/build/outputs/apk/release/app-release-unsigned.apk`
- **Android App Bundle (para Google Play Store):**  
  📁 `apps/android/app/build/outputs/bundle/release/app-release.aab`

> *Comando para generarlos:*  
> ```bash
> # 1. Compilar bibliotecas nativas de Rust (.so) para las 3 arquitecturas
> cd crates
> ./build-android.bat
> 
> # 2. Generar el APK
> cd ../apps/android
> ./gradlew assembleRelease
> ```

---

## ⚡ ¿Por Qué GigaCare? (Cero Placebos)

La mayoría de las herramientas de limpieza prometen aceleraciones milagrosas eliminando claves de registro válidas o cerrando procesos en segundo plano que el sistema vuelve a abrir inmediatamente. **GigaCare se rige por principios de ingeniería honesta:**

| Característica | Software Tradicional (CCleaner / Clean Master) | GigaCare |
| :--- | :---: | :---: |
| **Limpiador de Registro de Windows** | ❌ Agresivo (riesgo de romper el sistema) | 🛡️ **Cero Placebos:** No toca el registro crítico |
| **Task Killer de Memoria RAM** | ❌ Provoca mayor consumo al reiniciar apps | 🛡️ **Respeta el planificador del kernel** |
| **Política de Eliminación** | ❌ Borrado permanente directo (sin vuelta atrás) | 🔄 **Cuarentena Reversible con SHA-256 (1-clic)** |
| **Confirmación de Limpieza** | ⚠️ Borra sin revisión individual | 🔍 **Previsualización interactiva obligatoria** |
| **Curaduría de Fotos** | ❌ Solo duplicados por nombre o fecha | 🧠 **Perceptual pHash + IA Multimodal + FFT local** |
| **Privacidad en Análisis de Fotos**| ⚠️ Subida de fotos completas a la nube | 🔒 **Miniaturas adaptativas (≤512px, ≤100KB)** |
| **Consumo de Recursos** | ⚠️ Electron pesado (~200MB RAM) | ⚡ **Tauri 2.0 + Rust (<80MB RAM)** |

---

## 💎 Niveles de Licencia (Tiers Transparentes)

GigaCare ofrece un modelo sin suscripciones forzadas ni publicidad invasiva:

| Funcionalidad | Free (Gratuito) | BYOK (Clave Propia) | Pro ($9.99 Pago Único) |
| :--- | :---: | :---: | :---: |
| **Limpieza Smart Care (Temporales, Caché)** | ✅ Ilimitado | ✅ Ilimitado | ✅ Ilimitado |
| **Cuarentena Reversible Criptográfica** | ✅ 5 GB / 7 días | ✅ 10 GB / 14 días | ✅ 100 GB / 90 días |
| **Space Map Interactivo** | ✅ | ✅ | ✅ |
| **Curador de Fotos (Nitidez local FFT/Laplace)** | ✅ | ✅ | ✅ |
| **Curador con IA Multimodal (Google AI / FreeLLM)**| ❌ | ✅ Con tu API Key | ✅ Servidor gestionado |
| **Escaneos Programados Nocturnos** | ❌ | ❌ | ✅ |
| **Desinstalador y Detección de Huérfanos** | ✅ | ✅ | ✅ |

---

## 🛠️ Estructura del Monorepo

```
gigacare/
├── crates/                    # Espacio de trabajo nativo de Rust
│   ├── gigacare-core/         # Orquestador del escaneo, modelos y eventos de progreso
│   ├── gigacare-config/       # Modelo de persistencia de configuración JSON
│   ├── gigacare-quarantine/   # Cuarentena reversible, manifiesto v1 y SHA-256
│   ├── gigacare-vision/       # Métricas de nitidez local (Laplaciano, FFT) y miniaturas
│   ├── gigacare-ai/           # Router multi-proveedor (Google AI, FreeLLM, Ollama)
│   ├── gigacare-license/      # Verificación criptográfica HMAC-SHA256 de licencias
│   ├── gigacare-fs/           # Utilidades seguras de sistema de archivos
│   ├── gigacare-hash/         # Hashing criptográfico (SHA-256) y perceptual (pHash)
│   └── gigacare-uniffi/       # Bindings Kotlin generados para Android
├── apps/
│   ├── desktop/               # Aplicación Tauri 2.0 (React 18, TypeScript, Fluent UI v9)
│   └── android/               # Aplicación Android nativa (Kotlin, Compose, Material You)
└── docs/                      # Documentación de arquitectura, APIs y verificación
```

---

## 🤝 Contribuir y Soporte

- Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para conocer las pautas de código, lints y flujo de Pull Requests.
- Consulta [docs/architecture.md](docs/architecture.md) para comprender el flujo de datos y las decisiones técnicas.
- Reporta incidencias o sugiere mejoras abriendo un [Issue en GitHub](https://github.com/ready2devs/gigacare/issues).

---

## 📄 Licencia

Este proyecto está licenciado bajo los términos de la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.
