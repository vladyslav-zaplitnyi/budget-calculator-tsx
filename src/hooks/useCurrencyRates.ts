import { useCallback } from 'react';
import { useNbuRates } from './useNbuRates';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { ExchangeRates } from '../types';

export function useCurrencyRates(budgetState: BudgetStateWithSync) {
  const { fetchRatesForCurrencies } = useNbuRates();
  const {
    selectedCurrencies,
    setExchangeRates,
    setUsdRate,
    setEurRate,
    baseCurrency,
    isUk,
    setRateUpdateMessage,
    setIsUpdatingRates
  } = budgetState;

  // Оновлення курсів валют з API НБУ
  const handleUpdateNbuRates = useCallback(async () => {
    setIsUpdatingRates(true);
    setRateUpdateMessage('');

    try {
      const currenciesToFetch = selectedCurrencies.filter(code => code !== baseCurrency);
      
      if (currenciesToFetch.length === 0) {
        setRateUpdateMessage(
          isUk 
            ? 'ℹ️ Немає валют для оновлення (обрана тільки базова валюта)'
            : 'ℹ️ No currencies to update (only base currency selected)'
        );
        setTimeout(() => setRateUpdateMessage(''), 5000);
        setIsUpdatingRates(false);
        return;
      }

      const newRates = await fetchRatesForCurrencies(currenciesToFetch);
      
      setExchangeRates((prevRates: ExchangeRates) => {
        const updatedRates = { ...prevRates };
        
        Object.keys(newRates).forEach(currencyCode => {
          const nbuRate = newRates[currencyCode];
          const pairKey = `${baseCurrency}_${currencyCode}`;
          const reversePairKey = `${currencyCode}_${baseCurrency}`;
          
          const buyRate = nbuRate;
          const sellRate = nbuRate * 1.005;
          
          updatedRates[pairKey] = {
            buy: buyRate,
            sell: sellRate
          };
          
          updatedRates[reversePairKey] = {
            buy: 1 / sellRate,
            sell: 1 / buyRate
          };
        });
        
        return updatedRates;
      });
      
      if (newRates['USD'] !== undefined) {
        setUsdRate(newRates['USD']);
      }
      if (newRates['EUR'] !== undefined) {
        setEurRate(newRates['EUR']);
      }
      
      const ratesList = Object.entries(newRates)
        .map(([code, rate]) => {
          const buyRate = rate;
          const sellRate = rate * 1.005;
          return `${code}: купівля ${buyRate.toFixed(2)}, продаж ${sellRate.toFixed(2)}`;
        })
        .join(', ');
      
      setRateUpdateMessage(
        isUk 
          ? `✅ Курси оновлено: ${ratesList}`
          : `✅ Rates updated: ${ratesList}`
      );
      
      setTimeout(() => setRateUpdateMessage(''), 5000);
    } catch (error) {
      console.error('Помилка при оновленні курсів НБУ:', error);
      
      setRateUpdateMessage(
        isUk
          ? '❌ Помилка завантаження курсів НБУ. Перевірте інтернет-з\'єднання або введіть курси вручну.'
          : '❌ Error loading NBU rates. Check your internet connection or enter rates manually.'
      );
      
      setTimeout(() => setRateUpdateMessage(''), 5000);
    } finally {
      setIsUpdatingRates(false);
    }
  }, [selectedCurrencies, baseCurrency, isUk, fetchRatesForCurrencies, setExchangeRates, setUsdRate, setEurRate, setRateUpdateMessage, setIsUpdatingRates]);

  return {
    handleUpdateNbuRates
  };
}

