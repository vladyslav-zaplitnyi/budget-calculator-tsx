import 'react-i18next';
import ukTranslations from '../i18n/locales/uk.json';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof ukTranslations;
    };
  }
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof ukTranslations;
    };
  }
}
