import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ukTranslations from './locales/uk.json';
import enTranslations from './locales/en.json';
import { LANGUAGE_STORAGE_KEY } from '../utils/constants';

// Завантажуємо збережену мову з localStorage перед ініціалізацією
let savedLanguage = 'uk';
try {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'uk' || stored === 'en') {
    savedLanguage = stored;
  }
} catch (error) {
  console.error('Помилка при завантаженні мови з localStorage:', error);
}

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
    lng: savedLanguage, // Використовуємо збережену мову
    fallbackLng: 'en',
    defaultNS: 'translation',
    debug: false,
    interpolation: {
      escapeValue: false // React вже екранує значення
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY // Використовуємо той самий ключ, що й додаток
    }
  });

// Типізована функція для перекладів поза React компонентами
export const translate = (key: string): string => {
  return (i18n as any).t(key);
};

export default i18n;

