# Guía de Internacionalización (i18n): GigaCare 🌐

Esta guía explica la arquitectura de localización de GigaCare y los pasos exactos para agregar un nuevo idioma tanto en el cliente de escritorio (React + Tauri) como en la aplicación móvil (Android Compose).

---

## 🖥️ 1. Agregar un Idioma en el Cliente de Escritorio (Desktop)

El frontend de escritorio utiliza **react-i18next** con archivos JSON estructurados en dot-notation.

### Paso 1: Crear el archivo de traducción JSON
Crea un nuevo archivo en `apps/desktop/src/locales/{codigo_idioma}.json` (por ejemplo, `fr.json` para francés), tomando como base `es.json`:

```json
{
  "common": {
    "appName": "GigaCare",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "status": "Statut",
    "ready": "Prêt",
    "confirm": "Confirmer"
  },
  "modules": {
    "smartcare": {
      "title": "SmartCare",
      "subtitle": "Nettoyage du Système"
    },
    "quarantine": {
      "title": "Quarantaine",
      "subtitle": "Isolement Sécurisé"
    },
    "photos": {
      "title": "Curateur de Photos",
      "subtitle": "IA & Nettedé Locale"
    },
    "space_map": {
      "title": "Space Map",
      "subtitle": "Explorateur Visuel"
    },
    "settings": {
      "title": "Paramètres",
      "subtitle": "Préférences et Licence"
    }
  },
  "smartcare": {
    "scanButton": "Smart Care",
    "scanSubtitle": "Analyser le Système",
    "cancelScan": "Annuler l'analyse",
    "scanned": "Éléments analysés",
    "recoverable": "Récupérable"
  }
}
```

### Paso 2: Registrar el recurso en `i18n.ts`
Edita `apps/desktop/src/i18n.ts` e importa el nuevo archivo:

```typescript
import es from "./locales/es.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json"; // <-- Importar nuevo idioma

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    fr: { translation: fr },      // <-- Registrar nuevo idioma
  },
  fallbackLng: "es",
  interpolation: { escapeValue: false }
});
```

### Paso 3: Agregar la opción al selector en `SettingsPanel.tsx`
```tsx
<Option value="es">Español</Option>
<Option value="en">English</Option>
<Option value="fr">Français</Option>
```

---

## 📱 2. Agregar un Idioma en Android

Android gestiona los recursos de idioma mediante carpetas calificadas con el código de locale.

### Paso 1: Crear la carpeta de recursos
Crea el directorio `apps/android/app/src/main/res/values-{codigo_idioma}/` (por ejemplo, `values-fr/`).

### Paso 2: Crear el archivo `strings.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">GigaCare</string>
    <string name="smartcare_title">GigaCare Smart Care</string>
    <string name="smartcare_subtitle">Suite d'optimisation complète</string>
    <string name="scan">Analyser</string>
    <string name="stop">Arrêter</string>
    <string name="cancel">Annuler</string>
    <string name="confirm">Confirmer</string>
    <string name="settings">Paramètres</string>
    <string name="quarantine">Quarantaine</string>
</resources>
```

---

## 📐 3. Convenciones de Claves y Dot-Notation
- Agrupar siempre las cadenas por dominio funcional (`common`, `modules`, `smartcare`, `quarantine`, `photos`, `settings`).
- Las cadenas reutilizables comunes van estrictamente bajo el prefijo `common.*`.
- No concatenar frases en código para evitar problemas gramaticales en traducciones complejas; usar interpolación de variables (`{{count}}`).
