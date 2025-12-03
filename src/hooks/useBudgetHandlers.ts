import { useRef, useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays, normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage, saveToFirestore } from '../utils/storageHelpers';
import { validateSelectedCurrencies, getDefaultRate } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';
import { Budgets, ExchangeRates, Budget, Day } from '../types';

export function useBudgetHandlers() {
  const context = useBudgetContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isUk,
    selectedCurrencies,
    setSelectedCurrencies,
    exchangeRates,
    setExchangeRates,
    startBalanceUAH,
    setStartBalanceUAH,
    startBalanceUSD,
    setStartBalanceUSD,
    startBalanceEUR,
    setStartBalanceEUR,
    usdRate,
    setUsdRate,
    eurRate,
    setEurRate,
    activeBudgetId,
    setActiveBudgetId,
    budgets,
    setBudgets,
    days,
    setDays,
    setSaveMessage,
    setLoadMessage,
    setIsLoading,
    baseCurrency,
    setSyncStatus,
    getSyncStatusText,
    user
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
      
      // Створюємо очищені budgets локально
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || { name: 'Основний' };
      
      const clearedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(currencyCode => {
        clearedStartBalances[currencyCode] = null;
      });
      
      // Очищаємо всі старі поля початкових балансів
      const clearedBudget: Budget = {
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
      
      // Оновлюємо budgets в стані
      setBudgets(updatedBudgets);
      
      setDays(emptyDays);
      
      setLoadMessage('');
      setSaveMessage('');
      
      // Зберігаємо очищені budgets в localStorage
      saveToLocalStorage(
        null,
        null,
        null,
        defaultUsdRate,
        defaultEurRate,
        emptyDays,
        selectedCurrencies,
        exchangeRates,
        updatedBudgets,
        currentId
      );
      
      console.log('✅ Всі поля очищено');
    }
  }, [isUk, activeBudgetId, selectedCurrencies, exchangeRates, budgets, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setUsdRate, setEurRate, setBudgets, setDays, setLoadMessage, setSaveMessage]);

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
      const hasNewStructure = Object.keys(budget.exchangeRates).some(key => 
        key.includes('_') && typeof budget.exchangeRates![key] === 'object' && (budget.exchangeRates![key] as any).buy !== undefined
      );
      if (hasNewStructure) {
        setExchangeRates(budget.exchangeRates);
        const uahUsdPair = budget.exchangeRates['UAH_USD'];
        if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
          setUsdRate((uahUsdPair as any).buy);
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        const uahEurPair = budget.exchangeRates['UAH_EUR'];
        if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
          setEurRate((uahEurPair as any).buy);
        } else {
          setEurRate(budget.eurRate ?? 45);
        }
      } else {
        setExchangeRates(budget.exchangeRates);
        // @ts-ignore
        if (budget.exchangeRates['USD']) {
          // @ts-ignore
          setUsdRate(budget.exchangeRates['USD']);
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        // @ts-ignore
        if (budget.exchangeRates['EUR']) {
          // @ts-ignore
          setEurRate(budget.exchangeRates['EUR']);
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
        const hasNewStructure = Object.keys(defaultBudget.exchangeRates).some(key => 
          key.includes('_') && typeof defaultBudget.exchangeRates![key] === 'object' && (defaultBudget.exchangeRates![key] as any).buy !== undefined
        );
        if (hasNewStructure) {
          setExchangeRates(defaultBudget.exchangeRates);
          const uahUsdPair = defaultBudget.exchangeRates['UAH_USD'];
          if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
            setUsdRate((uahUsdPair as any).buy);
          } else {
            setUsdRate(defaultBudget.usdRate ?? 41.5);
          }
          const uahEurPair = defaultBudget.exchangeRates['UAH_EUR'];
          if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
            setEurRate((uahEurPair as any).buy);
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

  const handleCurrencyChange = useCallback((newCurrencies: string[]) => {
    const validated = validateSelectedCurrencies(newCurrencies);
    setSelectedCurrencies(validated);
    
    // Оновлюємо курси для нових валют (використовуємо нову структуру з парами)
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      validated.forEach(code => {
        if (code === baseCurrency) return;
        
        // Перевіряємо чи є пара для цієї валюти
        const pairKey = `${baseCurrency}_${code}`;
        const reversePairKey = `${code}_${baseCurrency}`;
        
        if (!newRates[pairKey] || typeof newRates[pairKey] !== 'object') {
          // Створюємо нову пару з дефолтним курсом
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
      
      // Видаляємо курси для валют, які більше не вибрані
      Object.keys(newRates).forEach(key => {
        // Перевіряємо чи це пара валют
        if (key.includes('_')) {
          const [from, to] = key.split('_');
          // Видаляємо пари, де хоча б одна валюта не в обраних
          if (!validated.includes(from) || !validated.includes(to)) {
            delete newRates[key];
          }
        } else {
          // Стара структура - видаляємо якщо валюта не в обраних
          if (!validated.includes(key)) {
            delete newRates[key];
          }
        }
      });

      // Синхронізуємо старі поля для зворотної сумісності (inside setState callback? No, this is for state update. Side effects should be outside.)
      // But here we return newRates.
      return newRates;
    });

    // We can't access the NEW rates here easily without another dependency or effect. 
    // But we can check existing rates + logic.
    // Actually, `setUsdRate` and `setEurRate` are separate states.
    // We should update them if we just added/updated USD/EUR?
    // The original code did it after setExchangeRates(newRates) where newRates was a local object.
    
    // I should reconstruct the local object logic.
    // Re-implementing logic to be safe:
    
    // Access current exchangeRates? 
    // I'll just use the functional update for setExchangeRates, and then calculate what the rates SHOULD be for USD/EUR based on current exchangeRates + default logic if missing.
    // It's a bit tricky because `exchangeRates` in closure is old.
    // But `setUsdRate` logic depends on the NEW rates.
    // I'll move the logic inside `setExchangeRates` updater? No, `setUsdRate` is separate.
    
    // I'll create `newRates` locally based on `exchangeRates` (from closure) exactly like the original code did.
    // Wait, the original code: `const newRates = { ...exchangeRates };`
    // So it used the closure `exchangeRates`. That's fine.
    
    // But I used functional update in `useCurrencyRates` and `useBudgetState` supports it.
    // Here I can just use object update if I trust `exchangeRates` from closure is fresh enough (it's in dependency array).
    
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
      if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
        setUsdRate((uahUsdPair as any).buy);
      }
    }
    if (validated.includes('EUR')) {
      const uahEurPair = newRates[`${baseCurrency}_EUR`];
      if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
        setEurRate((uahEurPair as any).buy);
      }
    }
  }, [exchangeRates, baseCurrency, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate]);

  const handleExchangeRateChange = useCallback((pairKey: string, type: string | undefined, rate: number) => {
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      
      if (pairKey && type && (type === 'buy' || type === 'sell')) {
        if (!newRates[pairKey] || typeof newRates[pairKey] !== 'object') {
          newRates[pairKey] = { buy: 1, sell: 1 };
        }
        (newRates[pairKey] as any)[type] = rate;
      } else {
        const currencyCode = pairKey;
        // @ts-ignore
        newRates[currencyCode] = rate;
      }
      return newRates;
    });

    // Side effect for legacy rates
    // We don't have the NEW rates here easily unless we duplicate logic.
    // If we are updating USD or EUR, we should update the separate state too.
    if (!type) {
       // Legacy mode
       if (pairKey === 'USD') setUsdRate(rate);
       if (pairKey === 'EUR') setEurRate(rate);
    } else {
       // Pair mode
       // If we updated UAH_USD buy rate, update usdRate
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

  const handleExportToJsonFile = useCallback(() => {
    try {
      const toNumber = (value: any) => {
        if (value === '' || value === null || value === undefined) return 0;
        if (typeof value === 'number') return value;
        const num = parseFloat(String(value));
        return isNaN(num) ? 0 : num;
      };

      const activeBudget = budgets && budgets[activeBudgetId || 'default'];
      const budgetStartBalances = activeBudget?.startBalances || {};
      const exportStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        if (code === 'UAH') {
          exportStartBalances[code] = startBalanceUAH;
        } else if (code === 'USD') {
          exportStartBalances[code] = startBalanceUSD;
        } else if (code === 'EUR') {
          exportStartBalances[code] = startBalanceEUR;
        } else {
          exportStartBalances[code] = budgetStartBalances[code] ?? null;
        }
      });

      const totals = calculateTotals(days, selectedCurrencies);
      const finalBalances = calculateFinalBalances(days, startBalanceUAH, startBalanceUSD, startBalanceEUR, selectedCurrencies, exportStartBalances);
      
      let totalInBaseCurrency = 0;
      selectedCurrencies.forEach(code => {
        const finalBalance = finalBalances[`finalBalance${code}`] || 0;
        if (code === baseCurrency) {
          totalInBaseCurrency += finalBalance;
        } else {
          totalInBaseCurrency += convertCurrency(finalBalance, code, baseCurrency, exchangeRates);
        }
      });

      const settingsToSave: any = {
        startBalanceUAH: startBalanceUAH !== null ? toNumber(startBalanceUAH) : null,
        startBalanceUSD: startBalanceUSD !== null ? toNumber(startBalanceUSD) : null,
        startBalanceEUR: startBalanceEUR !== null ? toNumber(startBalanceEUR) : null,
        usdRate: toNumber(usdRate),
        eurRate: toNumber(eurRate),
        selectedCurrencies: [...selectedCurrencies],
        exchangeRates: { ...exchangeRates }
      };

      selectedCurrencies.forEach(currencyCode => {
        const balanceKey = `startBalance${currencyCode}`;
        if (currencyCode === 'UAH') {
          settingsToSave[balanceKey] = startBalanceUAH !== null ? toNumber(startBalanceUAH) : null;
        } else if (currencyCode === 'USD') {
          settingsToSave[balanceKey] = startBalanceUSD !== null ? toNumber(startBalanceUSD) : null;
        } else if (currencyCode === 'EUR') {
          settingsToSave[balanceKey] = startBalanceEUR !== null ? toNumber(startBalanceEUR) : null;
        } else {
          const balance = exportStartBalances[currencyCode];
          settingsToSave[balanceKey] = balance !== null && balance !== undefined ? toNumber(balance) : null;
        }
      });

      if (exchangeRates['UAH_RON']) {
        const ronPair = exchangeRates['UAH_RON'] as any;
        settingsToSave.ronRate = ronPair.buy || ronPair.sell || null;
      }
      if (exchangeRates['UAH_PLN']) {
        const plnPair = exchangeRates['UAH_PLN'] as any;
        settingsToSave.plnRate = plnPair.buy || plnPair.sell || null;
      }

      const totalsToSave: any = {};
      selectedCurrencies.forEach(currencyCode => {
        totalsToSave[`totalIncome${currencyCode}`] = toNumber((totals[`totalIncome${currencyCode}`] || 0).toFixed(2));
        totalsToSave[`totalExpense${currencyCode}`] = toNumber((totals[`totalExpense${currencyCode}`] || 0).toFixed(2));
        totalsToSave[`finalBalance${currencyCode}`] = toNumber((finalBalances[`finalBalance${currencyCode}`] || 0).toFixed(2));
      });

      totalsToSave.totalIncomeUAH = toNumber((totals.totalIncomeUAH || 0).toFixed(2));
      totalsToSave.totalExpenseUAH = toNumber((totals.totalExpenseUAH || 0).toFixed(2));
      totalsToSave.totalIncomeUSD = toNumber((totals.totalIncomeUSD || 0).toFixed(2));
      totalsToSave.totalExpenseUSD = toNumber((totals.totalExpenseUSD || 0).toFixed(2));
      totalsToSave.totalIncomeEUR = toNumber((totals.totalIncomeEUR || 0).toFixed(2));
      totalsToSave.totalExpenseEUR = toNumber((totals.totalExpenseEUR || 0).toFixed(2));
      totalsToSave.finalBalanceUAH = toNumber((finalBalances.finalBalanceUAH || 0).toFixed(2));
      totalsToSave.finalBalanceUSD = toNumber((finalBalances.finalBalanceUSD || 0).toFixed(2));
      totalsToSave.finalBalanceEUR = toNumber((finalBalances.finalBalanceEUR || 0).toFixed(2));
      totalsToSave.totalInUAH = toNumber(totalInBaseCurrency.toFixed(2));

      const dataToSave = {
        savedAt: new Date().toISOString(),
        settings: settingsToSave,
        days: days.map((day, index) => ({
          day: day.day || (index + 1),
          description: String(day.description || '').trim(),
          transactions: Array.isArray(day.transactions) ? day.transactions : [],
          incomeUAH: toNumber(day.incomeUAH),
          expenseUAH: toNumber(day.expenseUAH),
          incomeUSD: toNumber(day.incomeUSD),
          expenseUSD: toNumber(day.expenseUSD),
          incomeEUR: toNumber(day.incomeEUR),
          expenseEUR: toNumber(day.expenseEUR)
        })),
        totals: totalsToSave
      };

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const filename = `budget_${year}-${month}-${day}_${hours}-${minutes}.json`;

      const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSaveMessage(
        isUk ? `✅ Файл збережено на диск: ${filename}` : `✅ File saved to disk: ${filename}`
      );
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Помилка при експорті JSON:', error);
      setSaveMessage(isUk ? '❌ Помилка при експорті JSON' : '❌ Error while exporting JSON');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  }, [isUk, budgets, activeBudgetId, selectedCurrencies, exchangeRates, startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, days, baseCurrency, setSaveMessage]);

  const handleImportFromJsonFile = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleJsonFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setLoadMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') return;
        
        const data = JSON.parse(text);

        console.log('📂 Імпорт даних з локального JSON-файлу:', file.name);

        if (data.settings) {
          let loadedCurrencies = ['UAH', 'USD', 'EUR'];
          if (data.settings.selectedCurrencies && Array.isArray(data.settings.selectedCurrencies)) {
            loadedCurrencies = validateSelectedCurrencies(data.settings.selectedCurrencies);
            setSelectedCurrencies(loadedCurrencies);
          }

          const loadedExchangeRates = data.settings.exchangeRates && typeof data.settings.exchangeRates === 'object'
            ? data.settings.exchangeRates
            : {};
          
          if (Object.keys(loadedExchangeRates).length > 0) {
            setExchangeRates(loadedExchangeRates);
            
            const uahUsdPair = loadedExchangeRates['UAH_USD'];
            if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
              setUsdRate((uahUsdPair as any).buy);
            } else {
              setUsdRate(data.settings.usdRate ?? 41.5);
            }
            
            const uahEurPair = loadedExchangeRates['UAH_EUR'];
            if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
              setEurRate((uahEurPair as any).buy);
            } else {
              setEurRate(data.settings.eurRate ?? 45);
            }
          } else {
            setUsdRate(data.settings.usdRate ?? 41.5);
            setEurRate(data.settings.eurRate ?? 45);
          }

          setStartBalanceUAH(data.settings.startBalanceUAH ?? null);
          setStartBalanceUSD(data.settings.startBalanceUSD ?? null);
          setStartBalanceEUR(data.settings.startBalanceEUR ?? null);
          
          const currentId = activeBudgetId || 'default';
          
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const existingBudget = safePrev[currentId] || { name: 'Основний' };
            
            const startBalances: Record<string, number | null> = {};
            
            loadedCurrencies.forEach(currencyCode => {
              const balanceKey = `startBalance${currencyCode}`;
              if (data.settings[balanceKey] !== undefined) {
                const balanceValue = data.settings[balanceKey];
                startBalances[currencyCode] = balanceValue === null || balanceValue === '' ? null : balanceValue;
              } else {
                startBalances[currencyCode] = existingBudget.startBalances?.[currencyCode] ?? null;
              }
            });
            
            return {
              ...safePrev,
              [currentId]: {
                ...existingBudget,
                startBalances,
                selectedCurrencies: loadedCurrencies,
                exchangeRates: loadedExchangeRates,
                usdRate: data.settings.usdRate ?? existingBudget.usdRate ?? 41.5,
                eurRate: data.settings.eurRate ?? existingBudget.eurRate ?? 45
              }
            };
          });
        }

        let normalizedDays: Day[] | null = null;
        if (data.days && Array.isArray(data.days)) {
          const toNumber = (value: any) => {
            if (value === '' || value === null || value === undefined) return 0;
            if (typeof value === 'number') return value;
            const num = parseFloat(String(value));
            return isNaN(num) ? 0 : num;
          };

          const loadedDays = data.days.map((d: any) => ({
            day: d.day || 0,
            description: String(d.description || '').trim(),
            transactions: Array.isArray(d.transactions) ? d.transactions : [],
            incomeUAH: toNumber(d.incomeUAH),
            expenseUAH: toNumber(d.expenseUAH),
            incomeUSD: toNumber(d.incomeUSD),
            expenseUSD: toNumber(d.expenseUSD),
            incomeEUR: toNumber(d.incomeEUR),
            expenseEUR: toNumber(d.expenseEUR)
          }));

          const newDays: Day[] = [];
          for (let i = 1; i <= 31; i++) {
            const loadedDay = loadedDays.find((d: any) => d.day === i);
            if (loadedDay) {
              newDays.push({
                day: loadedDay.day || i,
                description: String(loadedDay.description || '').trim(),
                transactions: Array.isArray(loadedDay.transactions) ? loadedDay.transactions : [],
                incomeUAH: toNumber(loadedDay.incomeUAH),
                expenseUAH: toNumber(loadedDay.expenseUAH),
                incomeUSD: toNumber(loadedDay.incomeUSD),
                expenseUSD: toNumber(loadedDay.expenseUSD),
                incomeEUR: toNumber(loadedDay.incomeEUR),
                expenseEUR: toNumber(loadedDay.expenseEUR)
              });
            } else {
              newDays.push({
                day: i,
                transactions: [],
                description: '',
                incomeUAH: 0,
                expenseUAH: 0,
                incomeUSD: 0,
                expenseUSD: 0,
                incomeEUR: 0,
                expenseEUR: 0
              });
            }
          }

          normalizedDays = normalizeDaysArray(newDays);
          setDays(normalizedDays);
        }

        setTimeout(() => {
          if (data.settings?.selectedCurrencies) {
            const validated = validateSelectedCurrencies(data.settings.selectedCurrencies);
            setSelectedCurrencies(validated);
          }
          
          if (data.settings?.exchangeRates) {
            setExchangeRates(data.settings.exchangeRates);
          }
          
          const finalSelectedCurrencies = data.settings?.selectedCurrencies 
            ? validateSelectedCurrencies(data.settings.selectedCurrencies)
            : selectedCurrencies;
          const finalExchangeRates = data.settings?.exchangeRates || exchangeRates;
          
          saveToLocalStorage(
            data.settings?.startBalanceUAH ?? null,
            data.settings?.startBalanceUSD ?? null,
            data.settings?.startBalanceEUR ?? null,
            data.settings?.usdRate ?? 41.5,
            data.settings?.eurRate ?? 45,
            normalizedDays || days,
            finalSelectedCurrencies,
            finalExchangeRates
          );
        }, 150);

        setLoadMessage(`✅ Імпортовано з файлу: ${file.name}`);
        setTimeout(() => setLoadMessage(''), 3000);
      } catch (err) {
        console.error('Помилка при читанні JSON-файлу:', err);
        setLoadMessage(
          isUk ? '❌ Некоректний або пошкоджений JSON-файл' : '❌ Invalid or corrupted JSON file'
        );
        setTimeout(() => setLoadMessage(''), 4000);
      } finally {
        setIsLoading(false);
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      console.error('Помилка читання файлу');
      setIsLoading(false);
      setLoadMessage(isUk ? '❌ Помилка читання файлу' : '❌ Error reading file');
      setTimeout(() => setLoadMessage(''), 4000);
      event.target.value = '';
    };

    reader.readAsText(file, 'utf-8');
  }, [isUk, activeBudgetId, selectedCurrencies, exchangeRates, days, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setBudgets, setDays, setIsLoading, setLoadMessage]);

  return {
    handleClearAll,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange,
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef
  };
}

