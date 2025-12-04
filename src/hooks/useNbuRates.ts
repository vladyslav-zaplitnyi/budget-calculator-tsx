import { handleError } from '../utils/errorHandler';

/**
 * Константи для кешування курсів НБУ
 */
const NBU_CACHE_KEY = 'nbu_rates_cache';
const NBU_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 години в мілісекундах

/**
 * Інтерфейс для структури кешу
 */
interface NbuRatesCache {
  date: string; // Дата в форматі YYYY-MM-DD
  timestamp: number; // Timestamp для точної перевірки
  rates: Record<string, number>; // Курси валют
}

/**
 * Отримує сьогоднішню дату в форматі YYYY-MM-DD
 */
const getTodayDateString = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

/**
 * Перевіряє, чи кеш актуальний (дата сьогоднішня)
 */
const isCacheValid = (cache: NbuRatesCache | null): boolean => {
  if (!cache) return false;
  
  const today = getTodayDateString();
  const now = Date.now();
  
  // Перевіряємо, чи дата сьогоднішня
  if (cache.date !== today) return false;
  
  // Додаткова перевірка: чи не минуло більше 24 годин
  if (now - cache.timestamp > NBU_CACHE_TTL_MS) return false;
  
  return true;
};

/**
 * Завантажує курси з кешу
 */
const loadRatesFromCache = (): NbuRatesCache | null => {
  try {
    const cached = localStorage.getItem(NBU_CACHE_KEY);
    if (!cached) return null;
    
    const cache: NbuRatesCache = JSON.parse(cached);
    return isCacheValid(cache) ? cache : null;
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'useNbuRates', action: 'loadRatesFromCache' }
    );
    return null;
  }
};

/**
 * Зберігає курси в кеш
 */
const saveRatesToCache = (rates: Record<string, number>): void => {
  try {
    const cache: NbuRatesCache = {
      date: getTodayDateString(),
      timestamp: Date.now(),
      rates
    };
    localStorage.setItem(NBU_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'useNbuRates', action: 'saveRatesToCache' }
    );
  }
};

/**
 * Хук для завантаження курсів валют з API Національного банку України
 */
export function useNbuRates() {
  /**
   * Завантажує актуальні курси для вказаних валют з API НБУ
   * Використовує кешування: якщо курси вже завантажені сьогодні, повертає з кешу
   * @param {string[]} currencyCodes - Масив кодів валют (наприклад, ['USD', 'EUR', 'PLN', 'RON'])
   * @returns {Promise<Object>} Об'єкт з курсами валют { USD: 41.5, EUR: 45.0, ... }
   * @throws {Error} Помилка при завантаженні або обробці даних
   */
  const fetchRatesForCurrencies = async (currencyCodes: string[] = []): Promise<Record<string, number>> => {
    // Перевіряємо кеш перед запитом до API
    const cached = loadRatesFromCache();
    
    if (cached) {
      // Перевіряємо, чи всі потрібні валюти є в кеші
      const allCurrenciesInCache = currencyCodes.every(code => {
        if (code === 'UAH') return true; // UAH завжди доступна
        return cached.rates[code] !== undefined;
      });
      
      if (allCurrenciesInCache) {
        // Фільтруємо тільки потрібні валюти з кешу
        const filteredRates: Record<string, number> = {};
        currencyCodes.forEach(code => {
          if (code === 'UAH') {
            filteredRates['UAH'] = 1;
          } else if (cached.rates[code] !== undefined) {
            filteredRates[code] = cached.rates[code];
          }
        });
        
        console.log('✅ Використано кешовані курси НБУ');
        return filteredRates;
      }
    }
    
    // Якщо кешу немає або в ньому немає всіх потрібних валют - робимо запит до API
    try {
      const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from NBU API');
      }

      // Створюємо об'єкт для зберігання курсів
      const rates: Record<string, number> = {};
      const missingCurrencies: string[] = [];

      // Для кожної валюти знаходимо курс в API
      currencyCodes.forEach(currencyCode => {
        // UAH завжди має курс 1 (базова валюта)
        if (currencyCode === 'UAH') {
          rates['UAH'] = 1;
          return;
        }

        interface NbuRateItem {
          cc: string;
          rate: number;
        }
        const rateData = data.find((item: NbuRateItem) => item.cc === currencyCode);
        
        if (rateData) {
          // Округлюємо до 2 знаків після коми
          rates[currencyCode] = Math.round(rateData.rate * 100) / 100;
        } else {
          missingCurrencies.push(currencyCode);
        }
      });

      // Якщо є валюты, які не знайдені в API, виводимо попередження
      if (missingCurrencies.length > 0) {
        console.warn('Деякі валюти не знайдені в API НБУ:', missingCurrencies);
      }

      // Зберігаємо всі отримані курси в кеш (не тільки запитувані)
      // Це дозволить використовувати кеш для інших валют теж
      const allRates: Record<string, number> = { UAH: 1 };
      interface NbuRateItem {
        cc: string;
        rate: number;
      }
      data.forEach((item: NbuRateItem) => {
        if (item.cc && item.rate !== undefined) {
          allRates[item.cc] = Math.round(item.rate * 100) / 100;
        }
      });
      
      saveRatesToCache(allRates);
      console.log('✅ Курси НБУ завантажено з API та збережено в кеш');

      return rates;
    } catch (error) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useNbuRates', action: 'fetchRatesForCurrencies', currencyCodes }
      );
      
      // Якщо помилка, але є кеш (навіть застарілий) - повертаємо його
      if (cached) {
        console.warn('⚠️ Використано застарілий кеш через помилку API');
        const filteredRates: Record<string, number> = {};
        currencyCodes.forEach(code => {
          if (code === 'UAH') {
            filteredRates['UAH'] = 1;
          } else if (cached.rates[code] !== undefined) {
            filteredRates[code] = cached.rates[code];
          }
        });
        return filteredRates;
      }
      
      throw error;
    }
  };

  return { fetchRatesForCurrencies };
}

