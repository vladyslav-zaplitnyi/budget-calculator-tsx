import { useCallback, useMemo } from 'react';
import { handleError } from '../utils/errorHandler';

/**
 * Константи для кешування курсів НБУ
 */
const NBU_CACHE_KEY = 'nbu_rates_cache';

/**
 * Інтерфейс для структури кешу
 */
interface NbuRatesCache {
  date: string; // Дата в форматі YYYY-MM-DD
  timestamp?: number; // Залишено для сумісності зі старим кешем
  rates: Record<string, number>; // Курси валют
}

interface NbuRateItem {
  cc: string;
  rate: number;
}

/**
 * Отримує сьогоднішню дату в форматі YYYY-MM-DD
 */
const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Перевіряє, чи кеш актуальний для поточного локального календарного дня.
 */
const isCacheValid = (cache: NbuRatesCache | null): boolean => {
  if (!cache) return false;
  
  const today = getTodayDateString();
  return cache.date === today;
};

/**
 * Завантажує курси з кешу
 */
const loadRatesFromCache = (allowStale = false): NbuRatesCache | null => {
  try {
    const cached = localStorage.getItem(NBU_CACHE_KEY);
    if (!cached) return null;
    
    const cache: NbuRatesCache = JSON.parse(cached);
    return allowStale || isCacheValid(cache) ? cache : null;
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
  const fetchRatesForCurrencies = useCallback(async (currencyCodes: string[] = []): Promise<Record<string, number>> => {
    const cached = loadRatesFromCache();
    const staleCached = cached || loadRatesFromCache(true);
    
    if (cached) {
      const allCurrenciesInCache = currencyCodes.every(code => {
        if (code === 'UAH') return true;
        return cached.rates[code] !== undefined;
      });
      
      if (allCurrenciesInCache) {
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
    
    try {
      const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from NBU API');
      }

      const rates: Record<string, number> = {};
      const missingCurrencies: string[] = [];

      currencyCodes.forEach(currencyCode => {
        if (currencyCode === 'UAH') {
          rates['UAH'] = 1;
          return;
        }

        const rateData = data.find((item: NbuRateItem) => item.cc === currencyCode);
        
        if (rateData) {
          rates[currencyCode] = Math.round(rateData.rate * 100) / 100;
        } else {
          missingCurrencies.push(currencyCode);
        }
      });

      if (missingCurrencies.length > 0) {
        console.warn('Деякі валюти не знайдені в API НБУ:', missingCurrencies);
      }

      const allRates: Record<string, number> = { UAH: 1 };
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
      
      if (staleCached) {
        console.warn('⚠️ Використано застарілий кеш через помилку API');
        const filteredRates: Record<string, number> = {};
        currencyCodes.forEach(code => {
          if (code === 'UAH') {
            filteredRates['UAH'] = 1;
          } else if (staleCached.rates[code] !== undefined) {
            filteredRates[code] = staleCached.rates[code];
          }
        });
        return filteredRates;
      }
      
      throw error;
    }
  }, []);

  return useMemo(() => ({ fetchRatesForCurrencies }), [fetchRatesForCurrencies]);
}

