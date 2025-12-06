import { useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays, normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { saveToFirestore, loadFromFirestore, saveToLocalStorage } from '../utils/storageHelpers';
import { Budgets, Budget, UserData } from '../types';
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
    activeBudgetId,
    setActiveBudgetId,
    budgets,
    setBudgets,
    setSelectedCurrencies,
    setExchangeRates,
    setDays,
    setSyncStatus,
    getSyncStatusText,
    user,
    baseCurrency,
    encryptionPassword,
    setIsEncrypted,
    setDisplayCurrency,
    setDisplayCurrencyIndex
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

    // ВАЖЛИВО: Беремо значення з поточного активного бюджету, а не з окремих станів
    const currentBudget = budgets?.[activeBudgetId || 'default'];
    const newStartBalances: Record<string, number | null> = {};
    selectedCurrencies.forEach(code => {
      // Завжди беремо значення з поточного бюджету
      newStartBalances[code] = currentBudget?.startBalances?.[code] ?? null;
    });

    // Беремо displayCurrency та displayCurrencyIndex з поточного бюджету або встановлюємо дефолт
    const currentDisplayCurrency = currentBudget?.displayCurrency || 'RON';
    const currentDisplayCurrencyIndex = currentBudget?.displayCurrencyIndex ?? 0;

    const newBudget: Budget = {
      name: trimmedName,
      selectedCurrencies: [...selectedCurrencies],
      exchangeRates: newExchangeRates,
      startBalances: newStartBalances,
      days: newDays,
      displayCurrency: currentDisplayCurrency,
      displayCurrencyIndex: currentDisplayCurrencyIndex
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

    setDays(newDays);
  }, [isUk, budgets, activeBudgetId, selectedCurrencies, exchangeRates, setBudgets, setActiveBudgetId, setDays]);

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
        setExchangeRates(budget.exchangeRates);
      } else {
        setExchangeRates({});
      }
      
      // 3) Завантажуємо початкові баланси з startBalances (вже в бюджеті)
      
      // 4) Завантажуємо дні - обов'язково нормалізуємо масив
      const normalizedDays = normalizeDaysArray(budget.days || []);
      console.log('📅 Завантажено днів:', normalizedDays.length, 'з бюджету', newId);
      setDays(normalizedDays);
      
      // 5) Встановлюємо displayCurrency та displayCurrencyIndex з бюджету
      const budgetDisplayCurrency = budget.displayCurrency || 'RON';
      const budgetDisplayCurrencyIndex = budget.displayCurrencyIndex ?? 0;
      setDisplayCurrency(budgetDisplayCurrency);
      setDisplayCurrencyIndex(budgetDisplayCurrencyIndex);
      
      // Зберігаємо в localStorage для синхронізації
      try {
        localStorage.setItem('displayCurrency', budgetDisplayCurrency);
        localStorage.setItem('displayCurrencyIndex', budgetDisplayCurrencyIndex.toString());
      } catch (error) {
        console.error('Помилка при збереженні displayCurrency в localStorage:', error);
      }
      
      // 6) Оновлюємо budgets, щоб зберегти поточний стан
      setBudgets((prevBudgets: Budgets) => {
        const safePrev = prevBudgets || {};
        
        return {
          ...safePrev,
          [newId]: {
            ...budget,
            startBalances: budget.startBalances || {},
            selectedCurrencies: appliedSelected,
            displayCurrency: budgetDisplayCurrency,
            displayCurrencyIndex: budgetDisplayCurrencyIndex
          }
        };
      });
    };

    // Викликаємо асинхронну функцію, але не чекаємо її в самому хендлері
    switchBudget();
  }, [budgets, user, baseCurrency, encryptionPassword, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setBudgets, setDays, setDisplayCurrency, setDisplayCurrencyIndex]);

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

    // Оновлюємо default budget перед встановленням стану
    if (defaultBudget) {
      updatedBudgets[newActiveId] = {
        ...defaultBudget,
        startBalances: defaultBudget.startBalances || {}
      };
    }

    // КРОК 1: Спочатку видаляємо з localStorage (локально)
    try {
      saveToLocalStorage(updatedBudgets, newActiveId);
    } catch (error) {
      console.error('Помилка при оновленні localStorage після видалення бюджету:', error);
    }

    // КРОК 2: Потім оновлюємо стан (локально)
    setBudgets(updatedBudgets);
    setActiveBudgetId(newActiveId);

    try {
      setCookie(ACTIVE_BUDGET_COOKIE_KEY, newActiveId, 365);
    } catch (error) {
      console.error('Помилка при збереженні вибору бюджету в cookie:', error);
    }

    // КРОК 3: Оновлюємо інші стани на основі default budget
    if (defaultBudget) {
      if (defaultBudget.selectedCurrencies) {
        setSelectedCurrencies(validateSelectedCurrencies(defaultBudget.selectedCurrencies));
      }
      
      if (defaultBudget.exchangeRates) {
        setExchangeRates(defaultBudget.exchangeRates);
      } else {
        setExchangeRates({});
      }
      
      setDays(normalizeDaysArray(defaultBudget.days || []));
    }

    // КРОК 4: Синхронізуємо з Firestore НЕГАЙНО (await, щоб завершити перед будь-якими іншими операціями)
    // Це гарантує, що видалений бюджет буде видалений з DB перед будь-яким перезавантаженням
    if (user) {
      (async () => {
        try {
          await saveToFirestore(user, updatedBudgets, newActiveId, true, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted);
          console.log('✅ Бюджет успішно видалено з Firestore');
        } catch (error) {
          console.error('❌ Помилка при видаленні бюджету з Firestore:', error);
        }
      })();
    }
  }, [isUk, user, budgets, activeBudgetId, setBudgets, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setDays, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted]);

  return {
    createNewBudget,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget
  };
}

