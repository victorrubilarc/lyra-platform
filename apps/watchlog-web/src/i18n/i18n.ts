import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { esCL } from "./locales/es-CL.js";

/**
 * Internacionalización. `es-CL` es el idioma por defecto y la única lengua con
 * catálogo completo hoy; el shell ya expone el selector para que añadir otro
 * idioma en Fase 7 sea solo registrar su catálogo aquí. La preferencia se
 * persiste en localStorage (no es un secreto).
 */

export const DEFAULT_LANGUAGE = "es-CL";
export const LANG_STORAGE_KEY = "wl_lang";

/** Idiomas ofrecidos en el selector. `ready` = tiene catálogo propio. */
export const SUPPORTED_LANGUAGES = [
  { code: "es-CL", ready: true },
  { code: "en", ready: false },
] as const;

function initialLanguage(): string {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    "es-CL": { translation: esCL },
  },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // React ya escapa
  returnNull: false,
});

/** Cambia el idioma y persiste la preferencia. */
export function setLanguage(code: string): void {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    /* almacenamiento no disponible: se mantiene en memoria */
  }
}

export default i18n;
