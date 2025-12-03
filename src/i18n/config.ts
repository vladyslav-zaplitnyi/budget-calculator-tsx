import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ukTranslations from './locales/uk.json';
import enTranslations from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uk: {
        translation: ukTranslations
      },
      en: {
        translation: enTranslations
      }
    },
    lng: 'uk', // Дефолтна мова
    fallbackLng: 'en',
    defaultNS: 'translation',
    debug: false,
    interpolation: {
      escapeValue: false // React вже екранує значення
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng'
    }
  });

// Типізована функція для перекладів поза React компонентами
export const translate = (key: string): string => {
  return (i18n as any).t(key);
};

export default i18n;

