import { useCallback } from 'react';
import { useNbuRates } from './useNbuRates';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { ExchangeRates } from '../types';
import { handleError } from '../utils/errorHandler';
import { translate } from '../i18n/config';
import { roundToDecimals } from '../utils/rounding';

export function useCurrencyRates(budgetState: BudgetStateWithSync) {
  const { fetchRatesForCurrencies } = useNbuRates();
  const {
    selectedCurrencies,
    setExchangeRates,
    baseCurrency,
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
        setRateUpdateMessage(translate('rates.noCurrenciesToUpdate'));
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
          const sellRate = roundToDecimals(nbuRate * 1.005, 2);
          
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
      
      const ratesList = Object.entries(newRates)
        .map(([code, rate]) => {
          const buyRate = rate;
          const sellRate = roundToDecimals(rate * 1.005, 2);
          return `${code}: купівля ${buyRate.toFixed(2)}, продаж ${sellRate.toFixed(2)}`;
        })
        .join(', ');
      
      setRateUpdateMessage(translate('rates.updated', { rates: ratesList }));
      
      setTimeout(() => setRateUpdateMessage(''), 5000);
    } catch (error) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useCurrencyRates', action: 'handleUpdateNbuRates' }
      );
      
      setRateUpdateMessage(translate('rates.errorLoading'));
      
      setTimeout(() => setRateUpdateMessage(''), 5000);
    } finally {
      setIsUpdatingRates(false);
    }
  }, [selectedCurrencies, baseCurrency, fetchRatesForCurrencies, setExchangeRates, setRateUpdateMessage, setIsUpdatingRates]);

  return {
    handleUpdateNbuRates
  };
}

