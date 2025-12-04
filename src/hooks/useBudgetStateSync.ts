import { useEffect } from 'react';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { Budgets } from '../types';

/**
 * Hook для синхронізації стану бюджету (баланси, курси, дні) в об'єкт budgets
 * Оновлює активний бюджет при зміні стану
 */
export function useBudgetStateSync(
  budgetState: BudgetStateWithSync,
  loadedBudgetsRef: React.MutableRefObject<Budgets | null>
) {
  const {
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    selectedCurrencies,
    exchangeRates,
    days,
    activeBudgetId,
    setBudgets,
    isInitialLoad
  } = budgetState;

  // Синхронізація початкових балансів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };

      const updatedStartBalances = { ...(existingBudget.startBalances || {}) };
      selectedCurrencies.forEach(code => {
        if (code === 'UAH') {
          updatedStartBalances[code] = startBalanceUAH;
        } else if (code === 'USD') {
          updatedStartBalances[code] = startBalanceUSD;
        } else if (code === 'EUR') {
          updatedStartBalances[code] = startBalanceEUR;
        } else {
          if (updatedStartBalances[code] === undefined) {
            updatedStartBalances[code] = null;
          }
        }
      });
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          startBalances: updatedStartBalances,
          selectedCurrencies
        }
      };
    });
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, selectedCurrencies, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація курсів валют у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          exchangeRates
        }
      };
    });
  }, [exchangeRates, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація днів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          days
        }
      };
    });
  }, [days, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Оновлення loadedBudgetsRef при зміні budgets (після початкового завантаження)
  // ВАЖЛИВО: Оновлюємо ref, щоб зберегти всі бюджети при синхронізації
  useEffect(() => {
    const { budgets: currentBudgets } = budgetState;
    if (currentBudgets && Object.keys(currentBudgets).length > 0) {
      const currentKeys = Object.keys(currentBudgets);
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      // Оновлюємо ref, якщо:
      // 1. Не початкове завантаження
      // 2. Поточні бюджети містять всі ключі з ref (збереження всіх бюджетів)
      // 3. Або поточні бюджети мають більше/рівну кількість ключів
      if (isInitialLoad === false) {
        const allRefKeysPreserved = refKeys.length === 0 || refKeys.every(key => currentKeys.includes(key));
        if (allRefKeysPreserved && currentKeys.length >= refKeys.length) {
          loadedBudgetsRef.current = { ...currentBudgets };
        }
      }
    }
  }, [budgetState, isInitialLoad, loadedBudgetsRef]);
}

