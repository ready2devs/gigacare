import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";
import en from "./locales/en.json";

const savedLang =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage.getItem("gigacare_lang")
    : null;

const defaultLang = savedLang === "en" || savedLang === "es" ? savedLang : "es";

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: defaultLang,
  fallbackLng: "es",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
