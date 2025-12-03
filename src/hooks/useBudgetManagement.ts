import { useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays, normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { saveToFirestore } from '../utils/storageHelpers';
import { Budgets, Budget } from '../types';
import { isExchangeRatePair, hasPairStructure, getBuyRate } from '../utils/typeGuards';

/**
 * Hook для управління бюджетами (створення, видалення, перемикання)
 */
export function useBudgetManagement() {
  const context = useBudgetContext();
  const {
    isUk,
    selectedCurrencies,
    exchangeRates,
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    usdRate,
    eurRate,
    activeBudgetId,
    setActiveBudgetId,
    budgets,
    setBudgets,
    setSelectedCurrencies,
    setExchangeRates,
    setUsdRate,
    setEurRate,
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setDays,
    setSyncStatus,
    getSyncStatusText,
    user
  } = context;

  const createNewBudget = useCallback((name: string) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    const currentBudgets = budgets || {};
    const count = Object.keys(currentBudgets).length;
    if (count >= 3) {
      alert(
        isUk
          ? 'Досягнуто ліміт безкоштовної версії (макс. 3 бюджети).'
          : 'Free version limit reached (max. 3 budgets).'
      );
      return;
    }

    const baseId =
      trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'budget';

    let newId = baseId;
    let suffix = 1;
    while (currentBudgets[newId]) {
      newId = `${baseId}-${suffix++}`;
    }

    const newDays = createEmptyMonthDays();
    const newExchangeRates = { ...exchangeRates };

    const newStartBalances: Record<string, number | null> = {};
    selectedCurrencies.forEach(code => {
      if (code === 'UAH') {
        newStartBalances[code] = startBalanceUAH;
      } else if (code === 'USD') {
        newStartBalances[code] = startBalanceUSD;
      } else if (code === 'EUR') {
        newStartBalances[code] = startBalanceEUR;
      } else {
        const currentBudget = budgets?.[activeBudgetId || 'default'];
        newStartBalances[code] = currentBudget?.startBalances?.[code] ?? null;
      }
    });

    const newBudget: Budget = {
      name: trimmedName,
      startBalanceUAH: null,
      startBalanceUSD: null,
      startBalanceEUR: null,
      usdRate: usdRate,
      eurRate: eurRate,
      selectedCurrencies: [...selectedCurrencies],
      exchangeRates: newExchangeRates,
      startBalances: newStartBalances,
      days: newDays
    };

    const updatedBudgets = {
      ...currentBudgets,
      [newId]: newBudget
    };

    setBudgets(updatedBudgets);
    setActiveBudgetId(newId);

    try {
      setCookie(ACTIVE_BUDGET_COOKIE_KEY, newId, 365);
    } catch (error) {
      console.error('Помилка при збереженні вибору бюджету в cookie:', error);
    }

    setStartBalanceUAH(newBudget.startBalanceUAH || null);
    setStartBalanceUSD(newBudget.startBalanceUSD || null);
    setStartBalanceEUR(newBudget.startBalanceEUR || null);
    setUsdRate(newBudget.usdRate || 41.5);
    setEurRate(newBudget.eurRate || 45);
    setDays(newDays);
  }, [isUk, budgets, activeBudgetId, selectedCurrencies, exchangeRates, startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, setBudgets, setActiveBudgetId, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setUsdRate, setEurRate, setDays]);

  const handleBudgetChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value;
    if (!newId || !budgets || !budgets[newId]) return;

    const budget = budgets[newId];
    setActiveBudgetId(newId);

    try {
      setCookie(ACTIVE_BUDGET_COOKIE_KEY, newId, 365);
    } catch (error) {
      console.error('Помилка при збереженні вибору бюджету в cookie:', error);
    }

    if (budget.selectedCurrencies) {
      setSelectedCurrencies(validateSelectedCurrencies(budget.selectedCurrencies));
    }
    
    if (budget.exchangeRates) {
      const hasNewStructure = hasPairStructure(budget.exchangeRates);
      if (hasNewStructure) {
        setExchangeRates(budget.exchangeRates);
        const uahUsdPair = budget.exchangeRates['UAH_USD'];
        if (isExchangeRatePair(uahUsdPair)) {
          setUsdRate(uahUsdPair.buy);
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        const uahEurPair = budget.exchangeRates['UAH_EUR'];
        if (isExchangeRatePair(uahEurPair)) {
          setEurRate(uahEurPair.buy);
        } else {
          setEurRate(budget.eurRate ?? 45);
        }
      } else {
        setExchangeRates(budget.exchangeRates);
        const usdRateValue = budget.exchangeRates['USD'];
        if (usdRateValue !== undefined) {
          setUsdRate(getBuyRate(usdRateValue, budget.usdRate ?? 41.5));
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        const eurRateValue = budget.exchangeRates['EUR'];
        if (eurRateValue !== undefined) {
          setEurRate(getBuyRate(eurRateValue, budget.eurRate ?? 45));
        } else {
          setEurRate(budget.eurRate ?? 45);
        }
      }
    } else {
      setUsdRate(budget.usdRate ?? 41.5);
      setEurRate(budget.eurRate ?? 45);
    }
    
    setStartBalanceUAH(budget.startBalanceUAH ?? null);
    setStartBalanceUSD(budget.startBalanceUSD ?? null);
    setStartBalanceEUR(budget.startBalanceEUR ?? null);
    
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      return {
        ...safePrev,
        [newId]: {
          ...budget,
          startBalances: budget.startBalances || {}
        }
      };
    });
    
    setDays(normalizeDaysArray(budget.days || []));
  }, [budgets, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setBudgets, setDays]);

  const handleAddBudgetClick = useCallback(() => {
    if (!user) {
      alert(
        isUk
          ? 'Для створення декількох бюджетів увійдіть через Google.'
          : 'Sign in with Google to create multiple budgets.'
      );
      return;
    }

    const namePrompt = isUk ? 'Введіть назву бюджету' : 'Enter budget name';
    const name = window.prompt(namePrompt);
    if (!name || !name.trim()) return;

    createNewBudget(name);
  }, [isUk, user, createNewBudget]);

  const handleDeleteBudget = useCallback(() => {
    if (!user) {
      alert(
        isUk
          ? 'Для видалення бюджетів увійдіть через Google.'
          : 'Sign in with Google to delete budgets.'
      );
      return;
    }

    const currentBudgets = budgets || {};
    const budgetCount = Object.keys(currentBudgets).length;

    if (budgetCount <= 1) {
      alert(
        isUk
          ? 'Не можна видалити останній бюджет. Має залишитися хоча б один бюджет.'
          : 'Cannot delete the last budget. At least one budget must remain.'
      );
      return;
    }

    if (activeBudgetId === 'default') {
      alert(
        isUk
          ? 'Не можна видалити основний бюджет (Main/Основний).'
          : 'Cannot delete the main budget (Main/Основний).'
      );
      return;
    }

    const budgetToDelete = currentBudgets[activeBudgetId];
    const budgetName = budgetToDelete?.name || activeBudgetId;

    const confirmMessage = isUk
      ? `Ви впевнені, що хочете видалити бюджет "${budgetName}"? Цю дію неможливо скасувати.`
      : `Are you sure you want to delete budget "${budgetName}"? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const updatedBudgets = { ...currentBudgets };
    delete updatedBudgets[activeBudgetId];

    const newActiveId = 'default';
    const defaultBudget = updatedBudgets[newActiveId];

    setBudgets(updatedBudgets);
    setActiveBudgetId(newActiveId);

    try {
      setCookie(ACTIVE_BUDGET_COOKIE_KEY, newActiveId, 365);
    } catch (error) {
      console.error('Помилка при збереженні вибору бюджету в cookie:', error);
    }

    if (defaultBudget) {
      if (defaultBudget.selectedCurrencies) {
        setSelectedCurrencies(validateSelectedCurrencies(defaultBudget.selectedCurrencies));
      }
      
      if (defaultBudget.exchangeRates) {
        const hasNewStructure = hasPairStructure(defaultBudget.exchangeRates);
        if (hasNewStructure) {
          setExchangeRates(defaultBudget.exchangeRates);
          const uahUsdPair = defaultBudget.exchangeRates['UAH_USD'];
          if (isExchangeRatePair(uahUsdPair)) {
            setUsdRate(uahUsdPair.buy);
          } else {
            setUsdRate(defaultBudget.usdRate ?? 41.5);
          }
          const uahEurPair = defaultBudget.exchangeRates['UAH_EUR'];
          if (isExchangeRatePair(uahEurPair)) {
            setEurRate(uahEurPair.buy);
          } else {
            setEurRate(defaultBudget.eurRate ?? 45);
          }
        } else {
          setExchangeRates(defaultBudget.exchangeRates);
          setUsdRate(defaultBudget.usdRate ?? 41.5);
          setEurRate(defaultBudget.eurRate ?? 45);
        }
      } else {
        setUsdRate(defaultBudget.usdRate ?? 41.5);
        setEurRate(defaultBudget.eurRate ?? 45);
      }
      
      setStartBalanceUAH(defaultBudget.startBalanceUAH ?? null);
      setStartBalanceUSD(defaultBudget.startBalanceUSD ?? null);
      setStartBalanceEUR(defaultBudget.startBalanceEUR ?? null);
      
      setBudgets((prevBudgets: Budgets) => {
        return {
          ...prevBudgets,
          [newActiveId]: {
            ...defaultBudget,
            startBalances: defaultBudget.startBalances || {}
          }
        };
      });
      
      setDays(normalizeDaysArray(defaultBudget.days || []));
    }

    if (user) {
      saveToFirestore(user, updatedBudgets, newActiveId, true, setSyncStatus, getSyncStatusText);
    }
  }, [isUk, user, budgets, activeBudgetId, setBudgets, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setDays, setSyncStatus, getSyncStatusText]);

  return {
    createNewBudget,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget
  };
}

