import { useEffect } from 'react';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { Budgets, Budget } from '../types';
import { DEFAULT_CURRENCIES } from '../utils/currencies';

/**
 * Hook для синхронізації стану бюджету (баланси, курси, дні) в об'єкт budgets
 * Оновлює активний бюджет при зміні стану
 */
export function useBudgetStateSync(
  budgetState: BudgetStateWithSync,
  loadedBudgetsRef: React.MutableRefObject<Budgets | null>
) {
  const {
    selectedCurrencies,
    exchangeRates,
    days,
    activeBudgetId,
    budgets,
    setBudgets,
    isInitialLoad,
    displayCurrency,
    displayCurrencyIndex
  } = budgetState;

  // Допоміжна функція для створення бюджету з усіма обов'язковими полями
  const createBudgetWithDefaults = (name: string = 'Основний'): Budget => ({
    name,
    startBalances: {},
    selectedCurrencies: DEFAULT_CURRENCIES,
    exchangeRates: {},
    days: [],
    displayCurrency: 'RON',
    displayCurrencyIndex: 0
  });

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
        const existing = prevBudgets?.[key] || loadedBudgetsRef.current?.[key];
        safePrev[key] = existing || createBudgetWithDefaults('Основний');
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults('Основний');

      // Оновлюємо startBalances: залишаємо тільки обрані валюти
      // ВАЖЛИВО: Беремо значення з існуючого бюджету, а не з окремих станів
      const updatedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        // Завжди беремо значення з існуючого бюджету
        updatedStartBalances[code] = existingBudget.startBalances?.[code] ?? null;
      });
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          startBalances: updatedStartBalances,
          selectedCurrencies: selectedCurrencies || existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: existingBudget.exchangeRates || {},
          days: existingBudget.days || []
        }
      };
    });
  }, [selectedCurrencies, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

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
        const existing = prevBudgets?.[key] || loadedBudgetsRef.current?.[key];
        safePrev[key] = existing || createBudgetWithDefaults('Основний');
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults('Основний');
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          exchangeRates: exchangeRates || {},
          startBalances: existingBudget.startBalances || {},
          selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          days: existingBudget.days || []
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
        const existing = prevBudgets?.[key] || loadedBudgetsRef.current?.[key];
        safePrev[key] = existing || createBudgetWithDefaults('Основний');
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults('Основний');
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          days: days || [],
          startBalances: existingBudget.startBalances || {},
          selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: existingBudget.exchangeRates || {}
        }
      };
    });
  }, [days, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація displayCurrency та displayCurrencyIndex у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        const existing = prevBudgets?.[key] || loadedBudgetsRef.current?.[key];
        safePrev[key] = existing || createBudgetWithDefaults('Основний');
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults('Основний');
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          displayCurrency: displayCurrency || 'RON',
          displayCurrencyIndex: displayCurrencyIndex ?? 0,
          startBalances: existingBudget.startBalances || {},
          selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: existingBudget.exchangeRates || {},
          days: existingBudget.days || []
        }
      };
    });
  }, [displayCurrency, displayCurrencyIndex, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);


  // Оновлення loadedBudgetsRef при зміні budgets (після початкового завантаження)
  // ВАЖЛИВО: Оновлюємо ref, щоб зберегти всі бюджети при синхронізації
  useEffect(() => {
    if (budgets && Object.keys(budgets).length > 0) {
      const currentKeys = Object.keys(budgets);
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      // Оновлюємо ref, якщо:
      // 1. Не початкове завантаження
      // 2. Поточні бюджети містять всі ключі з ref (збереження всіх бюджетів)
      // 3. Або поточні бюджети мають більше/рівну кількість ключів
      if (isInitialLoad === false) {
        const allRefKeysPreserved = refKeys.length === 0 || refKeys.every(key => currentKeys.includes(key));
        if (allRefKeysPreserved && currentKeys.length >= refKeys.length) {
          loadedBudgetsRef.current = { ...budgets };
        }
      }
    }
  }, [budgets, isInitialLoad, loadedBudgetsRef]);
}

