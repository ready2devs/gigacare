# Guía de Contribución a GigaCare 🤝

¡Gracias por tu interés en contribuir a **GigaCare**! Este documento proporciona la guía completa para configurar el entorno de desarrollo, comprender las convenciones de código y enviar Pull Requests (PR).

---

## 🏗️ 1. Estructura del Monorepo

```
gigacare/
├── crates/                    # Espacio de trabajo de Rust (Lógica nativa compartida)
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
└── .github/workflows/         # Pipeline de Integración Continua (CI)
```

---

## 💻 2. Configuración del Entorno de Desarrollo

### Prerrequisitos
1. **Rust Toolchain (1.80+)**:
   ```bash
   rustup default stable
   rustup component add clippy rustfmt
   ```
2. **Node.js (v20 LTS+) y pnpm (v9+)**:
   ```bash
   npm install -g pnpm
   ```
3. **C++ Build Tools (Windows)**:
   - Visual Studio 2022 con la carga de trabajo "Desarrollo para el escritorio con C++".
4. **Android SDK & NDK r25+** (Para desarrollo móvil):
   - Variable de entorno `ANDROID_HOME` y `ANDROID_NDK_HOME` configuradas.

---

## 🧪 3. Compilación y Ejecución de Pruebas

### Frontend de Escritorio (Tauri / React)
```bash
cd apps/desktop
pnpm install
pnpm test          # Ejecuta vitest con pruebas E2E e i18n
pnpm build         # Verifica que no existan errores de tipos en TypeScript
pnpm tauri dev     # Levanta el entorno de desarrollo con recarga en caliente
```

### Crates Nativos de Rust
```bash
cd crates
cargo fmt --all -- --check    # Validación de formato
cargo clippy --all-targets     # Análisis estático
cargo test --workspace        # Ejecutar todos los tests unitarios
cargo test -p gigacare-core --test integration_tests --features integration # Tests de integración
```

---

## 🎨 4. Convenciones de Código y Principios de Diseño

1. **Cero Placebos (CB-001 / CB-002):**
   - Queda estrictamente prohibido implementar limpiadores de registro en Windows o liberadores invasivos de RAM en Android.
2. **Privacidad Radical (CB-010):**
   - El análisis del sistema de archivos es 100% local.
   - En la curaduría con IA, solo se envían miniaturas adaptativas (≤512px, ≤100KB) cuando el usuario lo autoriza explícitamente.
3. **Aislamiento Reversible:**
   - Ningún archivo se elimina de forma destructiva directa; debe pasar siempre por la cuarentena con checksum SHA-256.
4. **Estilo de Código:**
   - **Rust**: `rustfmt` estándar y cero warnings en `clippy`.
   - **TypeScript**: Modo estricto (`strict: true`) sin declaraciones `any` no justificadas.
   - **Commits**: Seguir la convención de [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `test:`, `docs:`).

---

## 🚀 5. Proceso de Pull Request (PR)

1. Crea una rama descriptiva para tu feature o bugfix:
   ```bash
   git checkout -b feat/nombre-de-la-funcionalidad
   ```
2. Asegúrate de que todos los tests pasen localmente antes de enviar el PR.
3. Sube tus cambios a GitHub y abre un Pull Request hacia la rama `main`.
4. El pipeline de CI verificará automáticamente el formato, los lints de Rust, los tests de integración y la compilación de ambos clientes.
