import { useCallback, ChangeEvent, useState } from 'react';
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
    setDisplayCurrencyIndex,
    days,
    displayCurrency,
    displayCurrencyIndex,
    currentBudgetBookId,
    isCurrentBookReadOnly
  } = context;

  // Стан для модальних вікон
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  // Стан для ConfirmModal видалення бюджету
  const [showDeleteBudgetConfirmModal, setShowDeleteBudgetConfirmModal] = useState(false);
  const [budgetToDeleteName, setBudgetToDeleteName] = useState('');
  // Стан для модального вікна редагування назви бюджету
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const createNewBudget = useCallback((name: string) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    const currentBudgets = budgets || {};
    const count = Object.keys(currentBudgets).length;
    if (count >= 2) {
      setAlertMessage(translate('budget.maxLimitReached'));
      setAlertType('warning');
      setShowAlertModal(true);
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

    // ВАЖЛИВО: Спочатку зберігаємо поточний бюджет з усіма даними
    const oldId = activeBudgetId || 'default';
    const oldBudget = currentBudgets[oldId];
    
    // Зберігаємо поточні дані в старий бюджет перед створенням нового
    const savedOldBudget = oldBudget ? {
      ...oldBudget,
      days: days || oldBudget.days || [],
      selectedCurrencies: selectedCurrencies,
      exchangeRates: exchangeRates,
      displayCurrency: displayCurrency,
      displayCurrencyIndex: displayCurrencyIndex
    } : null;

    // ВАЖЛИВО: Беремо значення з поточного активного бюджету, а не з окремих станів
    const currentBudget = savedOldBudget || budgets?.[oldId];
    
    // Беремо budgetDate з поточного бюджету або використовуємо поточну дату
    const budgetDate = currentBudget?.budgetDate || {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    };
    
    const newDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
    const newExchangeRates = { ...exchangeRates };

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
      displayCurrencyIndex: currentDisplayCurrencyIndex,
      budgetDate
    };

    // ВАЖЛИВО: Зберігаємо старий бюджет з поточними даними + додаємо новий
    const updatedBudgets = {
      ...currentBudgets,
      ...(savedOldBudget ? { [oldId]: savedOldBudget } : {}),
      [newId]: newBudget
    };

    console.log('🆕 Створення нового бюджету:', newId, 'збережено старий:', oldId);

    setBudgets(updatedBudgets);
    setActiveBudgetId(newId);

    try {
      setCookie(ACTIVE_BUDGET_COOKIE_KEY, newId, 365);
    } catch (error) {
      console.error('Помилка при збереженні вибору бюджету в cookie:', error);
    }

    setDays(newDays);
  }, [budgets, activeBudgetId, selectedCurrencies, exchangeRates, days, displayCurrency, displayCurrencyIndex, setBudgets, setActiveBudgetId, setDays, user, isCurrentBookReadOnly]);

  const handleBudgetChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value;

    const switchBudget = async () => {
      if (!newId) return;
      
      // ВАЖЛИВО: Зберігаємо поточний бюджет ПЕРЕД перемиканням на новий
      const oldId = activeBudgetId || 'default';
      if (budgets && budgets[oldId] && oldId !== newId) {
        // Отримуємо поточний стан з контексту
        const currentDays = days;
        const currentSelectedCurrencies = selectedCurrencies;
        const currentExchangeRates = exchangeRates;
        const currentDisplayCurrency = displayCurrency;
        const currentDisplayCurrencyIndex = displayCurrencyIndex;
        
        console.log('💾 Зберігаємо поточний бюджет перед перемиканням:', oldId, 'днів:', currentDays?.length);
        
        setBudgets((prev: Budgets) => ({
          ...prev,
          [oldId]: {
            ...prev[oldId],
            days: currentDays || [],
            selectedCurrencies: currentSelectedCurrencies,
            exchangeRates: currentExchangeRates,
            displayCurrency: currentDisplayCurrency,
            displayCurrencyIndex: currentDisplayCurrencyIndex
          }
        }));
      }

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
      const normalizedDays = normalizeDaysArray(
        budget.days || [],
        budget.budgetDate?.year,
        budget.budgetDate?.month
      );
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
  }, [budgets, user, baseCurrency, encryptionPassword, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setBudgets, setDays, setDisplayCurrency, setDisplayCurrencyIndex, activeBudgetId, days, selectedCurrencies, exchangeRates, displayCurrency, displayCurrencyIndex]);

  const handleAddBudgetClick = useCallback(() => {
    if (!user) {
      setAlertMessage(translate('settings.budget.signInRequired'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    setShowPromptModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handlePromptConfirm = useCallback((name: string) => {
    if (!name || !name.trim()) return;
    createNewBudget(name);
  }, [createNewBudget]);

  const handleDeleteBudget = useCallback(() => {
    if (!user) {
      setAlertMessage(translate('settings.budget.signInRequiredDelete'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    const currentBudgets = budgets || {};
    const budgetCount = Object.keys(currentBudgets).length;

    if (budgetCount <= 1) {
      setAlertMessage(translate('budget.cannotDeleteLast'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (activeBudgetId === 'default') {
      setAlertMessage(translate('budget.cannotDeleteMain'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    const budgetToDelete = currentBudgets[activeBudgetId];
    const budgetName = budgetToDelete?.name || activeBudgetId;
    
    setBudgetToDeleteName(budgetName);
    setShowDeleteBudgetConfirmModal(true);
  }, [user, budgets, activeBudgetId, isCurrentBookReadOnly]);

  const handleConfirmDeleteBudget = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setShowDeleteBudgetConfirmModal(false);
      setBudgetToDeleteName('');
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    setShowDeleteBudgetConfirmModal(false);
    
    const currentBudgets = budgets || {};

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
      
      setDays(normalizeDaysArray(
        defaultBudget.days || [],
        defaultBudget.budgetDate?.year,
        defaultBudget.budgetDate?.month
      ));
    }

    // КРОК 4: Синхронізуємо з Firestore НЕГАЙНО (await, щоб завершити перед будь-якими іншими операціями)
    // Це гарантує, що видалений бюджет буде видалений з DB перед будь-яким перезавантаженням
    if (user) {
      (async () => {
        try {
          await saveToFirestore(
            user,
            updatedBudgets,
            newActiveId,
            true,
            setSyncStatus,
            getSyncStatusText,
            encryptionPassword,
            setIsEncrypted,
            { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
          );
          console.log('✅ Бюджет успішно видалено з Firestore');
        } catch (error) {
          console.error('❌ Помилка при видаленні бюджету з Firestore:', error);
        }
      })();
    }
  }, [budgets, activeBudgetId, setBudgets, setActiveBudgetId, setSelectedCurrencies, setExchangeRates, setDays, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted, user, isCurrentBookReadOnly, currentBudgetBookId]);

  const handleCancelDeleteBudget = useCallback(() => {
    setShowDeleteBudgetConfirmModal(false);
    setBudgetToDeleteName('');
  }, []);

  // Функція для оновлення назви бюджету
  const updateBudgetName = useCallback((budgetId: string, newName: string) => {
    const trimmedName = (newName || '').trim();
    if (!trimmedName) {
      setAlertMessage(translate('settings.budget.editNamePlaceholder'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    const currentBudgets = budgets || {};
    const budgetToUpdate = currentBudgets[budgetId];

    if (!budgetToUpdate) {
      console.error('Бюджет для оновлення не знайдено:', budgetId);
      return;
    }

    // Оновлюємо назву бюджету
    const updatedBudget: Budget = {
      ...budgetToUpdate,
      name: trimmedName
    };

    const updatedBudgets = {
      ...currentBudgets,
      [budgetId]: updatedBudget
    };

    // Оновлюємо стан
    setBudgets(updatedBudgets);

    // Зберігаємо в localStorage
    try {
      saveToLocalStorage(updatedBudgets, activeBudgetId);
    } catch (error) {
      console.error('Помилка при збереженні в localStorage:', error);
    }

    // Синхронізуємо з Firestore (якщо користувач авторизований)
    if (user) {
      (async () => {
        try {
          await saveToFirestore(
            user,
            updatedBudgets,
            activeBudgetId,
            true,
            setSyncStatus,
            getSyncStatusText,
            encryptionPassword,
            setIsEncrypted,
            { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
          );
          console.log('✅ Назва бюджету успішно оновлена');
        } catch (error) {
          console.error('❌ Помилка при оновленні назви бюджету в Firestore:', error);
        }
      })();
    }
  }, [budgets, activeBudgetId, user, encryptionPassword, setBudgets, setSyncStatus, getSyncStatusText, setIsEncrypted, isCurrentBookReadOnly, currentBudgetBookId]);

  const handleEditBudgetClick = useCallback(() => {
    if (!user) {
      setAlertMessage(translate('settings.budget.signInRequiredEdit'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    setEditingBudgetId(activeBudgetId);
    setShowEditNameModal(true);
  }, [user, activeBudgetId, isCurrentBookReadOnly]);

  const handleEditNameConfirm = useCallback((newName: string) => {
    if (!newName || !newName.trim() || !editingBudgetId) return;
    updateBudgetName(editingBudgetId, newName);
    setShowEditNameModal(false);
    setEditingBudgetId(null);
  }, [updateBudgetName, editingBudgetId]);

  const handleCancelEditName = useCallback(() => {
    setShowEditNameModal(false);
    setEditingBudgetId(null);
  }, []);

  return {
    createNewBudget,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget,
    showPromptModal,
    setShowPromptModal,
    handlePromptConfirm,
    showAlertModal,
    setShowAlertModal,
    alertMessage,
    alertType,
    showDeleteBudgetConfirmModal,
    setShowDeleteBudgetConfirmModal,
    handleConfirmDeleteBudget,
    handleCancelDeleteBudget,
    budgetToDeleteName,
    // Нові функції для редагування назви
    updateBudgetName,
    handleEditBudgetClick,
    handleEditNameConfirm,
    handleCancelEditName,
    showEditNameModal,
    setShowEditNameModal,
    editingBudgetId
  };
}

