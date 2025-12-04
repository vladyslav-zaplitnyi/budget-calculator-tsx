import { useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays, normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { saveToFirestore, loadFromFirestore } from '../utils/storageHelpers';
import { Budgets, Budget, UserData } from '../types';
import { isExchangeRatePair, hasPairStructure, getBuyRate } from '../utils/typeGuards';
import { translate } from '../i18n/config';

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
    user,
    baseCurrency,
    encryptionPassword,
    setIsEncrypted
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

    // Використовуємо startBalances
    setStartBalanceUAH(newBudget.startBalances?.['UAH'] ?? null);
    setStartBalanceUSD(newBudget.startBalances?.['USD'] ?? null);
    setStartBalanceEUR(newBudget.startBalances?.['EUR'] ?? null);
    setUsdRate(newBudget.usdRate || 41.5);
    setEurRate(newBudget.eurRate || 45);
    setDays(newDays);
  }, [isUk, budgets, activeBudgetId, selectedCurrencies, exchangeRates, startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, setBudgets, setActiveBudgetId, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setUsdRate, setEurRate, setDays]);

  const handleBudgetChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value;

    const switchBudget = async () => {
      if (!newId) return;

      let currentBudgets = budgets;

      // Якщо в локальному стані немає потрібного бюджету – пробуємо підвантажити з Firestore
      if ((!currentBudgets || !currentBudgets[newId]) && user) {
        try {
          const firestoreData = await loadFromFirestore(user, encryptionPassword);
          // Перевіряємо, чи це не зашифровані дані, що потребують пароля
          if (firestoreData && !('isEncrypted' in firestoreData && 'needsPassword' in firestoreData)) {
            const userData = firestoreData as UserData;
            if (userData.budgets && userData.budgets[newId]) {
              currentBudgets = userData.budgets;
              setBudgets(userData.budgets);
            }
          }
        } catch (error) {
          console.error('Помилка при підвантаженні бюджету з Firestore:', error);
        }
      }

      if (!currentBudgets || !currentBudgets[newId]) {
        console.warn('⚠️ handleBudgetChange: невалідний budget ID або budgets порожній', {
          newId,
          budgets: currentBudgets
        });
        return;
      }

      const budget = currentBudgets[newId];
      console.log('🔄 Перемикання на бюджет:', newId, budget);
      
      // Спочатку встановлюємо активний бюджет
      setActiveBudgetId(newId);

      try {
        setCookie(ACTIVE_BUDGET_COOKIE_KEY, newId, 365);
      } catch (error) {
        console.error('Помилка при збереженні вибору бюджету в cookie:', error);
      }

      // 1) Визначаємо, які валюти мають бути вибрані для цього бюджету
      let nextSelected: string[] | null = null;

      if (Array.isArray(budget.selectedCurrencies) && budget.selectedCurrencies.length > 0) {
        // Використовуємо збережений вибір, якщо він є
        nextSelected = validateSelectedCurrencies(budget.selectedCurrencies);
      } else if (budget.exchangeRates) {
        // Якщо selectedCurrencies немає – пробуємо відновити з exchangeRates
        const codesSet = new Set<string>();
        Object.keys(budget.exchangeRates).forEach((key) => {
          if (!key) return;
          if (key.includes('_')) {
            const [from, to] = key.split('_');
            if (from) codesSet.add(from);
            if (to) codesSet.add(to);
          } else {
            codesSet.add(key);
          }
        });

        const inferred = Array.from(codesSet).filter((code) => code !== baseCurrency);
        // Беремо не більше двох валют + базову, щоб в сумі було 3
        const limited = [baseCurrency, ...inferred.slice(0, 2)];
        nextSelected = validateSelectedCurrencies(limited);
      }

      // Фінальний масив валют без null (для стану та збереження в budgets)
      const appliedSelected: string[] = nextSelected
        ? validateSelectedCurrencies(nextSelected)
        : validateSelectedCurrencies(DEFAULT_CURRENCIES);

      setSelectedCurrencies(appliedSelected);
      
      // 2) Завантажуємо курси валют
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
        setExchangeRates({});
        setUsdRate(budget.usdRate ?? 41.5);
        setEurRate(budget.eurRate ?? 45);
      }
      
      // 3) Завантажуємо початкові баланси з startBalances
      const startBalances = budget.startBalances || {};
      setStartBalanceUAH(startBalances['UAH'] ?? null);
      setStartBalanceUSD(startBalances['USD'] ?? null);
      setStartBalanceEUR(startBalances['EUR'] ?? null);
      
      // 4) Завантажуємо дні - обов'язково нормалізуємо масив
      const normalizedDays = normalizeDaysArray(budget.days || []);
      console.log('📅 Завантажено днів:', normalizedDays.length, 'з бюджету', newId);
      setDays(normalizedDays);
      
      // 5) Оновлюємо budgets, щоб зберегти поточний стан
      setBudgets((prevBudgets: Budgets) => {
        const safePrev = prevBudgets || {};
        return {
          ...safePrev,
          [newId]: {
            ...budget,
            startBalances: budget.startBalances || {},
            selectedCurrencies: appliedSelected
          }
        };
      });
    };

    // Викликаємо асинхронну функцію, але не чекаємо її в самому хендлері
    switchBudget();
  }, [budgets, user, baseCurrency, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setBudgets, setDays]);

  const handleAddBudgetClick = useCallback(() => {
    if (!user) {
      alert(
        translate('settings.budget.signInRequired')
      );
      return;
    }

    const namePrompt = translate('settings.budget.namePrompt');
    const name = window.prompt(namePrompt);
    if (!name || !name.trim()) return;

    createNewBudget(name);
  }, [user, createNewBudget]);

  const handleDeleteBudget = useCallback(() => {
    if (!user) {
      alert(translate('settings.budget.signInRequiredDelete'));
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
      
      // Використовуємо startBalances
      const startBalances = defaultBudget.startBalances || {};
      setStartBalanceUAH(startBalances['UAH'] ?? null);
      setStartBalanceUSD(startBalances['USD'] ?? null);
      setStartBalanceEUR(startBalances['EUR'] ?? null);
      
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
      saveToFirestore(user, updatedBudgets, newActiveId, true, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted);
    }
  }, [isUk, user, budgets, activeBudgetId, setBudgets, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setDays, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted]);

  return {
    createNewBudget,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget
  };
}

