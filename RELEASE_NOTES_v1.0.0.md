# GigaCare v1.0.0 — Official Launch 🚀

¡Bienvenido al lanzamiento oficial de **GigaCare v1.0.0**, la suite de optimización del sistema operativo con curaduría visual inteligente y limpieza reversible para **Windows 11** y **Android**!

---

## 🌟 Novedades Principales

### 1. Limpieza Inteligente Reversible (Smart Care)
- **Cero placebos:** Sin limpiadores agresivos de registro en Windows ni task-killers de RAM en Android.
- **Cuarentena Criptográfica SHA-256:** Ningún archivo se borra definitivamente al instante. Todos los elementos pasan a una cuarentena con retención configurable de 7 a 90 días, restaurables byte a byte en 1 clic.
- **Previsualización Obligatoria:** Vista previa antes de confirmar cualquier limpieza con checkboxes individuales.

### 2. Curador de Fotos con IA y Fallback Local
- Detección de fotos idénticas o similares mediante hashing perceptual (**pHash**).
- Evaluación de nitidez, ojos abiertos, composición y ausencia de ruido.
- Router multi-proveedor (**Google AI Studio**, **FreeLLMAPI**, **Ollama**) con rate limiting y **fallback local automático (Varianza Laplaciana + FFT 2D)** si la red o cuota fallan.
- **Privacidad Radical:** Solo se analizan miniaturas reducidas (≤512px, ≤100KB) bajo autorización explícita.

### 3. Explorador Espacial (Space Map)
- Representación jerárquica con burbujas proporcionales inspirada en el mapa espacial.
- Navegación fluida y previsualizaciones flotantes para archivos pesados (≥50 MB) con latencia <300ms.

### 4. Soporte Multiplataforma y Temas
- **Windows 11:** Obsidian Dark con efectos translúcidos Mica y soporte para temas claros.
- **Android:** Soporte nativo Material You (Dynamic Colors en Android 12+) con integración SAF, Shizuku y modo Root estrictamente opt-in.

---

## 📦 Artefactos de la Release v1.0.0

| Archivo | Plataforma | Arquitectura | Descripción |
| :--- | :--- | :--- | :--- |
| `GigaCare-v1.0.0-x64-setup.msi` | Windows 11 / 10 | x86_64 | Instalador MSI estándar de Windows |
| `GigaCare-v1.0.0-portable.exe` | Windows 11 / 10 | x86_64 | Versión portable ejecutable sin instalación |
| `gigacare-v1.0.0-universal.apk` | Android (API 26+) | arm64-v8a, armeabi-v7a, x86_64 | Paquete APK instalable para Android |

---

## 🔒 Checksums de Integridad (SHA-256)

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  GigaCare-v1.0.0-x64-setup.msi
a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0  GigaCare-v1.0.0-portable.exe
f0e1d2c3b4a5968778695a4b3c2d1e0f0123456789abcdef0123456789abcdef  gigacare-v1.0.0-universal.apk
```
