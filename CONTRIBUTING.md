# Guía de Contribución — GigaCare

¡Gracias por tu interés en contribuir a GigaCare! Esta guía te ayudará a configurar el entorno de desarrollo y seguir las convenciones del proyecto.

## Setup del Entorno de Desarrollo

### Prerrequisitos

1. **Rust toolchain** (stable >= 1.75):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup default stable
   ```

2. **Node.js** >= 18:
   ```bash
   # Recomendado: usar nvm o fnm
   fnm install 18
   ```

3. **Tauri CLI** v2:
   ```bash
   cargo install tauri-cli --version "^2"
   ```

4. **Android SDK** (opcional, para la app Android):
   - Android Studio con API 26-34
   - NDK instalado
   - Variables de entorno: `ANDROID_HOME`, `ANDROID_NDK_HOME`

### Compilar el Core Rust

```bash
cd crates
cargo build
cargo test
```

### Compilar la App Desktop

```bash
cd apps/desktop
npm install
cargo tauri dev
```

### Compilar la App Android

```bash
cd apps/android
./gradlew assembleDebug
```

## Convenciones de Código

### Rust
- Formateo: `cargo fmt` (obligatorio en CI)
- Linting: `cargo clippy -- -D warnings`
- Tests: cobertura mínima por crate según la spec

### TypeScript / React
- Formateo: Prettier con config del proyecto
- Linting: ESLint
- Tipos estrictos: `strict: true` en tsconfig

### Kotlin / Android
- Formateo: ktlint
- Convenciones de Kotlin Coding Conventions

## Estructura del Monorepo

- `crates/` — Crates Rust (core compartido)
- `apps/desktop/` — App Tauri 2 (Windows)
- `apps/android/` — App Android (Kotlin + Compose)
- `docs/` — Documentación técnica

## Proceso de Pull Request

1. Crea un branch descriptivo: `feature/nombre-corto` o `fix/descripcion`
2. Asegúrate de que pasan: `cargo test`, `cargo clippy`, `cargo fmt --check`
3. Incluye tests para funcionalidad nueva
4. Describe los cambios en el PR

## Principios del Proyecto

- **Privacidad Radical:** Análisis local siempre que sea posible. Solo miniaturas reducidas a APIs externas.
- **Cero Placebos:** Cada funcionalidad tiene impacto real y medible.
- **Cuarentena Obligatoria:** Todo borrado pasa por cuarentena con restauración garantizada.
- **Transparencia:** Vista previa obligatoria antes de cualquier eliminación.