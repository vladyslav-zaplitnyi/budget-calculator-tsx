import { CurrencyInfo } from '../types';

// Конфігурація доступних валют
// Обмежено до: UAH, USD, EUR, PLN, RON
export const AVAILABLE_CURRENCIES: Record<string, CurrencyInfo> = {
  UAH: {
    code: 'UAH',
    name: { uk: 'Гривня', en: 'Hryvnia' },
    symbol: '₴',
    emoji: '🇺🇦'
  },
  USD: {
    code: 'USD',
    name: { uk: 'Долар', en: 'Dollar' },
    symbol: '$',
    emoji: '🇺🇸'
  },
  EUR: {
    code: 'EUR',
    name: { uk: 'Євро', en: 'Euro' },
    symbol: '€',
    emoji: '🇪🇺'
  },
  PLN: {
    code: 'PLN',
    name: { uk: 'Злотий', en: 'Zloty' },
    symbol: 'zł',
    emoji: '🇵🇱'
  },
  RON: {
    code: 'RON',
    name: { uk: 'Румунський лей', en: 'Romanian Leu' },
    symbol: 'lei',
    emoji: '🇷🇴'
  }
};

// Дефолтні валюти (для нових бюджетів)
export const DEFAULT_CURRENCIES: string[] = ['UAH', 'USD', 'EUR'];

// Отримати інформацію про валюту
export const getCurrencyInfo = (code: string): CurrencyInfo | null => {
  return AVAILABLE_CURRENCIES[code] || null;
};

// Отримати назву валюти залежно від мови
export const getCurrencyName = (code: string, language: 'uk' | 'en' = 'uk'): string => {
  const currency = getCurrencyInfo(code);
  if (!currency) return code;
  return currency.name[language] || currency.name.uk;
};

// Отримати символ валюти
export const getCurrencySymbol = (code: string): string => {
  const currency = getCurrencyInfo(code);
  return currency ? currency.symbol : code;
};

// Отримати емодзі валюти
export const getCurrencyEmoji = (code: string): string => {
  const currency = getCurrencyInfo(code);
  return currency ? currency.emoji : '';
};

// Валідація вибраних валют
export const validateSelectedCurrencies = (selected: unknown): string[] => {
  if (!Array.isArray(selected) || selected.length !== 3) {
    return DEFAULT_CURRENCIES;
  }
  // Перевіряємо, чи всі вибрані валюти існують
  const valid = selected.filter(code => AVAILABLE_CURRENCIES[code]);
  if (valid.length !== 3) {
    return DEFAULT_CURRENCIES;
  }
  return valid;
};

