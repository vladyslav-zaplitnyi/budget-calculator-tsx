import { CurrencyInfo } from '../types';

// Конфігурація доступних валют
// Обмежено до: UAH, USD, EUR, PLN, RON, CZK
export const AVAILABLE_CURRENCIES: Record<string, CurrencyInfo> = {
  UAH: {
    code: 'UAH',
    name: { uk: 'Гривня', en: 'Hryvnia' },
    symbol: '₴',
    emoji: '🇺🇦',
    regions: { uk: ['Україна'], en: ['Ukraine'] }
  },
  USD: {
    code: 'USD',
    name: { uk: 'Долар', en: 'Dollar' },
    symbol: '$',
    emoji: '🇺🇸',
    regions: { uk: ['США'], en: ['United States'] }
  },
  EUR: {
    code: 'EUR',
    name: { uk: 'Євро', en: 'Euro' },
    symbol: '€',
    emoji: '🇪🇺',
    regions: { uk: ['Німеччина'], en: ['Germany'] }
  },
  PLN: {
    code: 'PLN',
    name: { uk: 'Злотий', en: 'Zloty' },
    symbol: 'zł',
    emoji: '🇵🇱',
    regions: { uk: ['Польща'], en: ['Poland'] }
  },
  RON: {
    code: 'RON',
    name: { uk: 'Румунський лей', en: 'Romanian Leu' },
    symbol: 'lei',
    emoji: '🇷🇴',
    regions: { uk: ['Румунія'], en: ['Romania'] }
  },
  CZK: {
    code: 'CZK',
    name: { uk: 'Чеська крона', en: 'Czech Koruna' },
    symbol: 'Kč',
    emoji: '🇨🇿',
    regions: { uk: ['Чехія'], en: ['Czech Republic'] }
  }
};

export interface RegionalCurrencyInfo {
  countryCode: string;
  countryName: {
    uk: string;
    en: string;
  };
  currencyCode: string;
}

export const REGION_AUTO_VALUE = 'auto';
export const REGION_CURRENCY_STORAGE_KEY = 'settings_exchangeRates_regionCode';

const REGION_CURRENCY_RULES: RegionalCurrencyInfo[] = [
  { countryCode: 'UA', countryName: { uk: 'Україна', en: 'Ukraine' }, currencyCode: 'UAH' },
  { countryCode: 'US', countryName: { uk: 'США', en: 'United States' }, currencyCode: 'USD' },
  { countryCode: 'DE', countryName: { uk: 'Німеччина', en: 'Germany' }, currencyCode: 'EUR' },
  { countryCode: 'PL', countryName: { uk: 'Польща', en: 'Poland' }, currencyCode: 'PLN' },
  { countryCode: 'RO', countryName: { uk: 'Румунія', en: 'Romania' }, currencyCode: 'RON' },
  { countryCode: 'CZ', countryName: { uk: 'Чехія', en: 'Czech Republic' }, currencyCode: 'CZK' }
];

const TIME_ZONE_REGION_MAP: Record<string, string> = {
  'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'Europe/Berlin': 'DE',
  'Europe/Warsaw': 'PL',
  'Europe/Bucharest': 'RO',
  'Europe/Prague': 'CZ'
};

const extractRegionFromLocale = (locale: string): string | null => {
  const parts = locale.replace('_', '-').split('-');
  const region = [...parts].reverse().find(part => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
};

const getBrowserRegionCandidates = (): string[] => {
  if (typeof window === 'undefined') return [];

  const candidates: string[] = [];
  const languages = typeof navigator !== 'undefined'
    ? [...(navigator.languages || []), navigator.language].filter(Boolean)
    : [];

  languages.forEach(locale => {
    const region = extractRegionFromLocale(locale);
    if (region) candidates.push(region);
  });

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const region = TIME_ZONE_REGION_MAP[timeZone];
    if (region) candidates.push(region);
  } catch {
    // Region detection is best effort only.
  }

  return Array.from(new Set(candidates));
};

export const detectRegionalCurrency = (): RegionalCurrencyInfo | null => {
  const regionCandidates = getBrowserRegionCandidates();
  return REGION_CURRENCY_RULES.find(rule => regionCandidates.includes(rule.countryCode)) || null;
};

export const getRegionalCurrencyOptions = (): RegionalCurrencyInfo[] => REGION_CURRENCY_RULES;

export const getRegionalCurrencyByCountryCode = (countryCode: string | null | undefined): RegionalCurrencyInfo | null => {
  if (!countryCode || countryCode === REGION_AUTO_VALUE) return null;
  return REGION_CURRENCY_RULES.find(rule => rule.countryCode === countryCode.toUpperCase()) || null;
};

export const getStoredRegionCode = (): string => {
  try {
    if (typeof window === 'undefined') return REGION_AUTO_VALUE;
    const stored = window.localStorage.getItem(REGION_CURRENCY_STORAGE_KEY);
    if (!stored || stored === REGION_AUTO_VALUE) return REGION_AUTO_VALUE;
    return getRegionalCurrencyByCountryCode(stored)?.countryCode || REGION_AUTO_VALUE;
  } catch {
    return REGION_AUTO_VALUE;
  }
};

export const resolveRegionalCurrency = (countryCode: string | null | undefined = getStoredRegionCode()): RegionalCurrencyInfo | null => {
  const selectedRegion = getRegionalCurrencyByCountryCode(countryCode);
  return selectedRegion || detectRegionalCurrency();
};

// Дефолтні валюти (для нових бюджетів)
export const DEFAULT_CURRENCIES: string[] = ['UAH', 'USD', 'EUR'];

// Базова валюта для конвертації (за замовчуванням перша валюта з DEFAULT_CURRENCIES)
// Всі інші валюти конвертуються через базову валюту
export const BASE_CURRENCY: string = DEFAULT_CURRENCIES[0] || 'UAH';

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

export const getCurrencyRegionLabel = (code: string, language: 'uk' | 'en' = 'uk'): string => {
  const currency = getCurrencyInfo(code);
  if (!currency?.regions) return '';
  return (currency.regions[language] || currency.regions.uk).join(', ');
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

