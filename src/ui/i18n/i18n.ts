import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslation from "../locales/en.json";

// The demo ships English only, so this drops the real app's lazy locale
// loaders and language detection.
export const supportedLngs = ["en"];

i18n.use(initReactI18next).init({
  resources: { en: { translation: enTranslation } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function normalizeLanguageCode(): string {
  return "en";
}

export default i18n;
