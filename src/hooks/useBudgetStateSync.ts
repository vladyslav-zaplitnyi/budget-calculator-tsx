import { useEffect, useRef } from 'react';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { Budgets, Budget } from '../types';
import { DEFAULT_CURRENCIES } from '../utils/currencies';
import { translate } from '../i18n/config';
import {
  monthKeyFromBudgetDate,
  trimOldestMonthKeys,
  getCurrentCalendarBudgetDate
} from '../utils/rollingMonthsBudget';
import { applyBalanceWaterfallToBudget, buildMonthSlice } from '../utils/balanceWaterfall';

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
    displayCurrencyIndex,
  } = budgetState;

  // ВАЖЛИВО: Відстежуємо попередній activeBudgetId для запобігання перезапису даних
  // при перемиканні між бюджетами
  const prevActiveBudgetIdRef = useRef<string | null>(null);
  const isBudgetSwitchingRef = useRef<boolean>(false);

  // Допоміжна функція для створення бюджету з усіма обов'язковими полями
  const createBudgetWithDefaults = (name?: string): Budget => {
    const now = new Date();
    return {
      name: name || translate('budget.defaultBudgetName'),
      startBalances: {},
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: [],
      displayCurrency: 'RON',
      displayCurrencyIndex: 0,
      budgetDate: {
        year: now.getFullYear(),
        month: now.getMonth()
      }
    };
  };

  // ВАЖЛИВО: Відстежуємо зміну бюджету для запобігання перезапису даних
  // Коли activeBudgetId змінюється, встановлюємо прапорець "isBudgetSwitching"
  // щоб наступні useEffect не перезаписували дані нового бюджету старими даними
  useEffect(() => {
    const prevId = prevActiveBudgetIdRef.current;
    const currentId = activeBudgetId || 'default';
    
    if (prevId !== null && prevId !== currentId) {
      // Бюджет змінився - встановлюємо прапорець
      console.log('🔄 Виявлено зміну бюджету:', prevId, '->', currentId);
      isBudgetSwitchingRef.current = true;
      
      // Скидаємо прапорець через таймаут, щоб дати час завантажитися новим даним
      // Використовуємо requestAnimationFrame + setTimeout для надійності
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          console.log('✅ Завершено перемикання бюджету, дозволяємо синхронізацію');
          isBudgetSwitchingRef.current = false;
        });
      }, 150);
      
      prevActiveBudgetIdRef.current = currentId;
      return () => clearTimeout(timeoutId);
    }
    
    prevActiveBudgetIdRef.current = currentId;
  }, [activeBudgetId]);

  // Синхронізація початкових балансів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    // ВАЖЛИВО: Пропускаємо синхронізацію при перемиканні бюджету
    if (isBudgetSwitchingRef.current) {
      console.log('⏸️ Пропускаємо синхронізацію балансів - перемикання бюджету в процесі');
      return;
    }
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      // ВАЖЛИВО: Визначаємо, чи це сценарій відновлення (login/initial load) чи нормальна синхронізація
      // Якщо prevBudgets порожній або має тільки 'default', а ref має більше - це відновлення з Firestore
      // Якщо prevBudgets має бюджети - це нормальна синхронізація, не відновлюємо видалені
      const isRestoreScenario = (prevKeys.length === 0 || (prevKeys.length === 1 && prevKeys[0] === 'default')) 
        && refKeys.length > prevKeys.length;
      const allKeys = isRestoreScenario ? Array.from(new Set([...prevKeys, ...refKeys])) : prevKeys;
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        // Спочатку беремо з prevBudgets, потім з ref (якщо це сценарій відновлення)
        const existing = prevBudgets?.[key] || (isRestoreScenario ? loadedBudgetsRef.current?.[key] : undefined);
        safePrev[key] = existing || createBudgetWithDefaults();
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults();

      // Оновлюємо startBalances: залишаємо тільки обрані валюти
      // ВАЖЛИВО: Беремо значення з існуючого бюджету, а не з окремих станів
      const updatedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        // Завжди беремо значення з існуючого бюджету
        updatedStartBalances[code] = existingBudget.startBalances?.[code] ?? null;
      });

      const bd = existingBudget.budgetDate || getCurrentCalendarBudgetDate();
      const viewedKey = monthKeyFromBudgetDate(bd.year, bd.month);
      const anchor = getCurrentCalendarBudgetDate();
      const anchorKey = monthKeyFromBudgetDate(anchor.year, anchor.month);

      let monthsByKey = { ...(existingBudget.monthsByKey || {}) };
      monthsByKey[viewedKey] = buildMonthSlice(
        existingBudget.days || [],
        viewedKey === anchorKey
          ? updatedStartBalances
          : { ...(monthsByKey[viewedKey]?.startBalances || {}) }
      );
      if (viewedKey !== anchorKey && monthsByKey[anchorKey]) {
        monthsByKey[anchorKey] = buildMonthSlice(
          monthsByKey[anchorKey].days || [],
          updatedStartBalances
        );
      }
      monthsByKey = trimOldestMonthKeys(monthsByKey);

      const draftBudget: Budget = {
        ...existingBudget,
        startBalances: updatedStartBalances,
        selectedCurrencies: selectedCurrencies || existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
        exchangeRates: existingBudget.exchangeRates || {},
        days: existingBudget.days || [],
        budgetDate: existingBudget.budgetDate,
        monthsByKey
      };
      const afterWaterfall = applyBalanceWaterfallToBudget(draftBudget);
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету
      // Не замінюємо їх, щоб не втратити курси для невибраних валют
      const preservedExchangeRates = existingBudget.exchangeRates || {};
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          ...afterWaterfall,
          exchangeRates: preservedExchangeRates
        }
      };
    });
  }, [selectedCurrencies, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація курсів валют у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    // ВАЖЛИВО: Пропускаємо синхронізацію при перемиканні бюджету
    if (isBudgetSwitchingRef.current) {
      console.log('⏸️ Пропускаємо синхронізацію курсів - перемикання бюджету в процесі');
      return;
    }
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      const isRestoreScenario = (prevKeys.length === 0 || (prevKeys.length === 1 && prevKeys[0] === 'default')) 
        && refKeys.length > prevKeys.length;
      const allKeys = isRestoreScenario ? Array.from(new Set([...prevKeys, ...refKeys])) : prevKeys;
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        const existing = prevBudgets?.[key] || (isRestoreScenario ? loadedBudgetsRef.current?.[key] : undefined);
        safePrev[key] = existing || createBudgetWithDefaults();
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults();
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету та об'єднуємо з поточними курсами зі стану
      // Це гарантує, що курси для невибраних валют не втрачаються
      const mergedExchangeRates = {
        ...(existingBudget.exchangeRates || {}),
        ...(exchangeRates || {})
      };

      const bd = existingBudget.budgetDate || getCurrentCalendarBudgetDate();
      const viewedKey = monthKeyFromBudgetDate(bd.year, bd.month);
      const anchor = getCurrentCalendarBudgetDate();
      const anchorKey = monthKeyFromBudgetDate(anchor.year, anchor.month);
      const monthsByKey = trimOldestMonthKeys({
        ...(existingBudget.monthsByKey || {}),
        [viewedKey]: buildMonthSlice(
          existingBudget.days || [],
          viewedKey === anchorKey
            ? { ...(existingBudget.startBalances || {}) }
            : { ...(existingBudget.monthsByKey?.[viewedKey]?.startBalances || {}) }
        )
      });
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          exchangeRates: mergedExchangeRates,
          startBalances: existingBudget.startBalances || {},
          selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          days: existingBudget.days || [],
          // Зберігаємо budgetDate з існуючого бюджету
          budgetDate: existingBudget.budgetDate,
          monthsByKey
        }
      };
    });
  }, [exchangeRates, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація днів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    // ВАЖЛИВО: Пропускаємо синхронізацію при перемиканні бюджету
    // щоб не перезаписати дані нового бюджету старими даними
    if (isBudgetSwitchingRef.current) {
      console.log('⏸️ Пропускаємо синхронізацію днів - перемикання бюджету в процесі');
      return;
    }
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      const isRestoreScenario = (prevKeys.length === 0 || (prevKeys.length === 1 && prevKeys[0] === 'default')) 
        && refKeys.length > prevKeys.length;
      const allKeys = isRestoreScenario ? Array.from(new Set([...prevKeys, ...refKeys])) : prevKeys;
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        const existing = prevBudgets?.[key] || (isRestoreScenario ? loadedBudgetsRef.current?.[key] : undefined);
        safePrev[key] = existing || createBudgetWithDefaults();
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults();
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету
      // Курси не повинні втрачатися при синхронізації днів
      const preservedExchangeRates = existingBudget.exchangeRates || {};

      const bd = existingBudget.budgetDate || getCurrentCalendarBudgetDate();
      const viewedKey = monthKeyFromBudgetDate(bd.year, bd.month);
      const anchor = getCurrentCalendarBudgetDate();
      const anchorKey = monthKeyFromBudgetDate(anchor.year, anchor.month);
      const monthsByKey = trimOldestMonthKeys({
        ...(existingBudget.monthsByKey || {}),
        [viewedKey]: buildMonthSlice(
          days || [],
          viewedKey === anchorKey
            ? { ...(existingBudget.startBalances || {}) }
            : { ...(existingBudget.monthsByKey?.[viewedKey]?.startBalances || {}) }
        )
      });

      const draftBudget: Budget = {
        ...existingBudget,
        days: days || [],
        startBalances: existingBudget.startBalances || {},
        selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
        exchangeRates: preservedExchangeRates,
        budgetDate: existingBudget.budgetDate,
        monthsByKey
      };
      const afterWaterfall = applyBalanceWaterfallToBudget(draftBudget);
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          ...afterWaterfall,
          exchangeRates: preservedExchangeRates
        }
      };
    });
  }, [days, activeBudgetId, isInitialLoad, setBudgets, loadedBudgetsRef]);

  // Синхронізація displayCurrency та displayCurrencyIndex у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    // ВАЖЛИВО: Пропускаємо синхронізацію при перемиканні бюджету
    if (isBudgetSwitchingRef.current) {
      console.log('⏸️ Пропускаємо синхронізацію displayCurrency - перемикання бюджету в процесі');
      return;
    }
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      const isRestoreScenario = (prevKeys.length === 0 || (prevKeys.length === 1 && prevKeys[0] === 'default')) 
        && refKeys.length > prevKeys.length;
      const allKeys = isRestoreScenario ? Array.from(new Set([...prevKeys, ...refKeys])) : prevKeys;
      
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        const existing = prevBudgets?.[key] || (isRestoreScenario ? loadedBudgetsRef.current?.[key] : undefined);
        safePrev[key] = existing || createBudgetWithDefaults();
      });
      
      const existingBudget = safePrev[currentId] || createBudgetWithDefaults();
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету
      // Курси не повинні втрачатися при синхронізації displayCurrency
      const preservedExchangeRates = existingBudget.exchangeRates || {};

      const bd = existingBudget.budgetDate || getCurrentCalendarBudgetDate();
      const viewedKey = monthKeyFromBudgetDate(bd.year, bd.month);
      const anchor = getCurrentCalendarBudgetDate();
      const anchorKey = monthKeyFromBudgetDate(anchor.year, anchor.month);
      const monthsByKey = trimOldestMonthKeys({
        ...(existingBudget.monthsByKey || {}),
        [viewedKey]: buildMonthSlice(
          existingBudget.days || [],
          viewedKey === anchorKey
            ? { ...(existingBudget.startBalances || {}) }
            : { ...(existingBudget.monthsByKey?.[viewedKey]?.startBalances || {}) }
        )
      });
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          displayCurrency: displayCurrency || 'RON',
          displayCurrencyIndex: displayCurrencyIndex ?? 0,
          startBalances: existingBudget.startBalances || {},
          selectedCurrencies: existingBudget.selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: preservedExchangeRates,
          days: existingBudget.days || [],
          // Зберігаємо budgetDate з існуючого бюджету
          budgetDate: existingBudget.budgetDate,
          monthsByKey
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
      // 4. АБО всі поточні ключі є в ref (видалення бюджету - дозволяємо оновлення)
      if (isInitialLoad === false) {
        const allRefKeysPreserved = refKeys.length === 0 || refKeys.every(key => currentKeys.includes(key));
        const allCurrentKeysInRef = currentKeys.length === 0 || currentKeys.every(key => refKeys.includes(key));
        if ((allRefKeysPreserved && currentKeys.length >= refKeys.length) || allCurrentKeysInRef) {
          loadedBudgetsRef.current = { ...budgets };
        }
      }
    }
  }, [budgets, isInitialLoad, loadedBudgetsRef]);
}

