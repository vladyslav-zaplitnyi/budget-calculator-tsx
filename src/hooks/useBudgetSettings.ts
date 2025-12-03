import { useCallback } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, getDefaultRate } from '../utils/currencies';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';

/**
 * Hook для управління налаштуваннями бюджету (валюти, курси, баланси)
 */
export function useBudgetSettings() {
  const context = useBudgetContext();
  const {
    isUk,
    selectedCurrencies,
    setSelectedCurrencies,
    exchangeRates,
    setExchangeRates,
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setUsdRate,
    setEurRate,
    activeBudgetId,
    budgets,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    baseCurrency
  } = context;

  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm(
      isUk
        ? 'Ви впевнені? Це стере всі введені дані та очистить вибір файлу (файл не буде видалено з диску)!'
        : 'Are you sure? This will clear all entered data and reset the selected file (the file will not be deleted from disk)!'
    );
    
    if (confirmed) {
      setStartBalanceUAH(null);
      setStartBalanceUSD(null);
      setStartBalanceEUR(null);
      
      const defaultUsdRate = 41.5;
      const defaultEurRate = 45;
      setUsdRate(defaultUsdRate);
      setEurRate(defaultEurRate);
      
      const currentId = activeBudgetId || 'default';
      const emptyDays = createEmptyMonthDays();
      
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || { name: 'Основний' };
      
      const clearedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(currencyCode => {
        clearedStartBalances[currencyCode] = null;
      });
      
      const clearedBudget = {
        ...existingBudget,
        startBalanceUAH: null,
        startBalanceUSD: null,
        startBalanceEUR: null,
        startBalances: clearedStartBalances,
        days: emptyDays,
        usdRate: defaultUsdRate,
        eurRate: defaultEurRate
      };
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: clearedBudget
      };
      
      setBudgets(updatedBudgets);
      setDays(emptyDays);
      
      setLoadMessage('');
      setSaveMessage('');
      
      console.log('✅ Всі поля очищено');
    }
  }, [isUk, activeBudgetId, selectedCurrencies, budgets, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setUsdRate, setEurRate, setBudgets, setDays, setLoadMessage, setSaveMessage]);

  const handleCurrencyChange = useCallback((newCurrencies: string[]) => {
    const validated = validateSelectedCurrencies(newCurrencies);
    setSelectedCurrencies(validated);
    
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      validated.forEach(code => {
        if (code === baseCurrency) return;
        
        const pairKey = `${baseCurrency}_${code}`;
        const reversePairKey = `${code}_${baseCurrency}`;
        
        if (!newRates[pairKey] || typeof newRates[pairKey] !== 'object') {
          const defaultRate = getDefaultRate(code);
          newRates[pairKey] = {
            buy: defaultRate,
            sell: defaultRate * 1.005
          };
          newRates[reversePairKey] = {
            buy: 1 / (defaultRate * 1.005),
            sell: 1 / defaultRate
          };
        }
      });
      
      Object.keys(newRates).forEach(key => {
        if (key.includes('_')) {
          const [from, to] = key.split('_');
          if (!validated.includes(from) || !validated.includes(to)) {
            delete newRates[key];
          }
        } else {
          if (!validated.includes(key)) {
            delete newRates[key];
          }
        }
      });

      return newRates;
    });

    const newRates = { ...exchangeRates };
    validated.forEach(code => {
      if (code === baseCurrency) return;
      
      const pairKey = `${baseCurrency}_${code}`;
      const reversePairKey = `${code}_${baseCurrency}`;
      
      if (!newRates[pairKey] || typeof newRates[pairKey] !== 'object') {
        const defaultRate = getDefaultRate(code);
        newRates[pairKey] = {
          buy: defaultRate,
          sell: defaultRate * 1.005
        };
        newRates[reversePairKey] = {
          buy: 1 / (defaultRate * 1.005),
          sell: 1 / defaultRate
        };
      }
    });
    
    Object.keys(newRates).forEach(key => {
      if (key.includes('_')) {
        const [from, to] = key.split('_');
        if (!validated.includes(from) || !validated.includes(to)) {
          delete newRates[key];
        }
      } else {
        if (!validated.includes(key)) {
          delete newRates[key];
        }
      }
    });
    
    setExchangeRates(newRates);
    
    if (validated.includes('USD')) {
      const uahUsdPair = newRates[`${baseCurrency}_USD`];
      if (isExchangeRatePair(uahUsdPair)) {
        setUsdRate(uahUsdPair.buy);
      }
    }
    if (validated.includes('EUR')) {
      const uahEurPair = newRates[`${baseCurrency}_EUR`];
      if (isExchangeRatePair(uahEurPair)) {
        setEurRate(uahEurPair.buy);
      }
    }
  }, [exchangeRates, baseCurrency, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate]);

  const handleExchangeRateChange = useCallback((pairKey: string, type: string | undefined, rate: number) => {
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      
      if (pairKey && type && (type === 'buy' || type === 'sell')) {
        const currentValue = newRates[pairKey];
        if (!isExchangeRatePair(currentValue)) {
          newRates[pairKey] = { buy: 1, sell: 1 };
        }
        const pair = newRates[pairKey];
        if (isExchangeRatePair(pair)) {
          pair[type] = rate;
        }
      } else {
        const currencyCode = pairKey;
        newRates[currencyCode] = rate;
      }
      return newRates;
    });

    if (!type) {
       if (pairKey === 'USD') setUsdRate(rate);
       if (pairKey === 'EUR') setEurRate(rate);
    } else {
       if (pairKey === `${baseCurrency}_USD` && type === 'buy') {
          setUsdRate(rate);
       }
       if (pairKey === `${baseCurrency}_EUR` && type === 'buy') {
          setEurRate(rate);
       }
    }
  }, [baseCurrency, setExchangeRates, setUsdRate, setEurRate]);

  const handleStartBalanceChange = useCallback((currencyCode: string, value: string) => {
    let numValue: number | null = null;
    if (value !== '' && value !== null && value !== undefined) {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }
    
    if (currencyCode === 'UAH') {
      setStartBalanceUAH(numValue);
    } else if (currencyCode === 'USD') {
      setStartBalanceUSD(numValue);
    } else if (currencyCode === 'EUR') {
      setStartBalanceEUR(numValue);
    } else {
      const currentId = activeBudgetId || 'default';
      setBudgets((prevBudgets: Budgets) => {
        const safePrev = prevBudgets || {};
        const existingBudget = safePrev[currentId] || {
          name: 'Основний'
        };
        
        const startBalances = existingBudget.startBalances || {};
        startBalances[currencyCode] = numValue;
        
        return {
          ...safePrev,
          [currentId]: {
            ...existingBudget,
            startBalances
          }
        };
      });
    }
  }, [activeBudgetId, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setBudgets]);

  return {
    handleClearAll,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange
  };
}

