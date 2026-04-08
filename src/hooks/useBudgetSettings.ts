import { useCallback, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
import { saveToFirestore, saveToLocalStorage } from '../utils/storageHelpers';
import { calculateFinalBalances, calculateTotals, sanitizeNumberInput } from '../utils/calculations';
import { translate } from '../i18n/config';

/**
 * Hook для управління налаштуваннями бюджету (валюти, курси, баланси)
 */
export function useBudgetSettings() {
  const context = useBudgetContext();
  const {
    // Поточні значення стану
    selectedCurrencies,
    exchangeRates,
    activeBudgetId,
    budgets,
    days,
    // Сетери стану
    setSelectedCurrencies,
    setExchangeRates,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    user,
    encryptionPassword,
    setEncryptionPassword,
    isEncrypted,
    setIsEncrypted,
    setSyncStatus,
    getSyncStatusText
  } = context;

  // Стан для модальних вікон шифрування
  const [showEnableEncryptionModal, setShowEnableEncryptionModal] = useState(false);
  const [showDisableEncryptionModal, setShowDisableEncryptionModal] = useState(false);
  // Стан для модального вікна "Почати новий місяць"
  const [showStartNewMonthModal, setShowStartNewMonthModal] = useState(false);
  // Стан для AlertModal
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  // Стан для ConfirmModal
  const [showClearAllConfirmModal, setShowClearAllConfirmModal] = useState(false);
  const [showClearAllDaysConfirmModal, setShowClearAllDaysConfirmModal] = useState(false);

  const handleClearAll = useCallback(() => {
    setShowClearAllConfirmModal(true);
  }, []);

  const handleConfirmClearAll = useCallback(() => {
    setShowClearAllConfirmModal(false);
      const currentId = activeBudgetId || 'default';
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId];
      const budgetDate = existingBudget?.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };
      const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
      
      const clearedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(currencyCode => {
        clearedStartBalances[currencyCode] = null;
      });
      
      const clearedBudget = {
        ...existingBudget,
        startBalances: clearedStartBalances,
        days: emptyDays,
        selectedCurrencies: existingBudget.selectedCurrencies || selectedCurrencies || DEFAULT_CURRENCIES,
        exchangeRates: existingBudget.exchangeRates || {},
        displayCurrency: existingBudget.displayCurrency || 'RON',
        displayCurrencyIndex: existingBudget.displayCurrencyIndex ?? 0,
        budgetDate: existingBudget.budgetDate || budgetDate
      };
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: clearedBudget
      };
      
      setBudgets(updatedBudgets);
      setDays(emptyDays);
      
      setLoadMessage('');
      setSaveMessage('');
      
      // Оновлюємо localStorage з очищеними даними
      saveToLocalStorage(updatedBudgets, currentId);
      
      console.log('✅ Всі поля очищено');
  }, [activeBudgetId, selectedCurrencies, budgets, setBudgets, setDays, setLoadMessage, setSaveMessage]);

  const handleCancelClearAll = useCallback(() => {
    setShowClearAllConfirmModal(false);
  }, []);

  const handleClearAllDays = useCallback(() => {
    setShowClearAllDaysConfirmModal(true);
  }, []);

  const handleConfirmClearAllDays = useCallback(() => {
    setShowClearAllDaysConfirmModal(false);
      const currentId = activeBudgetId || 'default';
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      const budgetDate = existingBudget.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };
      const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
      
      // Очищаємо тільки дні, залишаємо все інше без змін
      const clearedBudget = {
        ...existingBudget,
        days: emptyDays
      };
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: clearedBudget
      };
      
      setBudgets(updatedBudgets);
      setDays(emptyDays);
      
      // Оновлюємо localStorage з очищеними даними
      saveToLocalStorage(updatedBudgets, currentId);
      
      console.log('✅ Всі дні очищено');
  }, [activeBudgetId, budgets, setBudgets, setDays]);

  const handleCancelClearAllDays = useCallback(() => {
    setShowClearAllDaysConfirmModal(false);
  }, []);

  const handleStartNewMonth = useCallback(() => {
    setShowStartNewMonthModal(true);
  }, []);

  const handleConfirmStartNewMonth = useCallback(() => {
    const currentId = activeBudgetId || 'default';
    const safePrev = budgets || {};
    const existingBudget = safePrev[currentId] || {
      name: translate('budget.defaultBudgetName'),
      startBalances: {},
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: [],
      displayCurrency: 'RON',
      displayCurrencyIndex: 0
    };

    // Отримуємо поточну дату бюджету
    const currentBudgetDate = existingBudget.budgetDate || {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    };

    // Обчислюємо наступний місяць
    let newMonth = currentBudgetDate.month + 1;
    let newYear = currentBudgetDate.year;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear = newYear + 1;
    }

    const newBudgetDate = {
      year: newYear,
      month: newMonth
    };

    // Отримуємо поточні початкові баланси
    const currentStartBalances = existingBudget.startBalances || {};

    // Обчислюємо поточні фінальні баланси
    const totals = calculateTotals(days || [], selectedCurrencies);
    const finalBalances = calculateFinalBalances(
      days || [],
      selectedCurrencies,
      currentStartBalances,
      totals
    );

    // Створюємо нові початкові баланси з поточних фінальних балансів
    const newStartBalances: Record<string, number | null> = {};
    selectedCurrencies.forEach(currencyCode => {
      const finalBalanceKey = `finalBalance${currencyCode}`;
      const finalBalance = finalBalances[finalBalanceKey] || 0;
      newStartBalances[currencyCode] = finalBalance;
    });

    // Створюємо порожні дні для нового місяця
    const emptyDays = createEmptyMonthDays(newYear, newMonth);

    // Оновлюємо бюджет: стираємо дні, встановлюємо нові початкові баланси і оновлюємо дату
    const updatedBudget = {
      ...existingBudget,
      startBalances: newStartBalances,
      days: emptyDays,
      budgetDate: newBudgetDate
    };

    const updatedBudgets: Budgets = {
      ...safePrev,
      [currentId]: updatedBudget
    };

    setBudgets(updatedBudgets);
    setDays(emptyDays);

    // Оновлюємо localStorage
    saveToLocalStorage(updatedBudgets, currentId);

    // Якщо користувач авторизований, зберігаємо в Firestore
    if (user) {
      saveToFirestore(
        user,
        updatedBudgets,
        currentId,
        false,
        setSyncStatus,
        getSyncStatusText,
        encryptionPassword || undefined,
        setIsEncrypted
      ).catch((error) => {
        console.error('Помилка при збереженні в Firestore:', error);
      });
    }

    setShowStartNewMonthModal(false);
    console.log('✅ Новий місяць розпочато:', newBudgetDate);
  }, [activeBudgetId, budgets, days, selectedCurrencies, setBudgets, setDays, user, encryptionPassword, setSyncStatus, getSyncStatusText, setIsEncrypted]);

  const handleCancelStartNewMonth = useCallback(() => {
    setShowStartNewMonthModal(false);
  }, []);

  const handleCurrencyChange = useCallback((newCurrencies: string[]) => {
    const validated = validateSelectedCurrencies(newCurrencies);
    setSelectedCurrencies(validated);

    // Оновлюємо budgets безпосередньо: встановлюємо selectedCurrencies та оновлюємо startBalances
    // ВАЖЛИВО: Зберігаємо всі курси обміну, навіть для валют, які тимчасово не вибрані
    const currentId = activeBudgetId || 'default';
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      // Оновлюємо startBalances: залишаємо тільки обрані валюти
      // ВАЖЛИВО: Беремо значення з існуючого бюджету, а не з окремих станів
      const updatedStartBalances: Record<string, number | null> = {};
      validated.forEach(code => {
        // Завжди беремо значення з існуючого бюджету
        updatedStartBalances[code] = existingBudget.startBalances?.[code] ?? null;
      });
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету, не видаляємо їх
      // Це дозволяє зберігати курси для валют, які тимчасово не вибрані
      const preservedExchangeRates = existingBudget.exchangeRates || {};
      
      // Об'єднуємо збережені курси з поточними курсами зі стану
      // Це гарантує, що нові курси, введені користувачем, також зберігаються
      const mergedRates: ExchangeRates = {
        ...preservedExchangeRates,
        ...exchangeRates
      };
      
      const updatedBudget = {
        ...existingBudget,
        selectedCurrencies: validated,
        startBalances: updatedStartBalances,
        exchangeRates: mergedRates
      };
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: updatedBudget
      };
      
      // Оновлюємо стан курсів, зберігаючи всі курси
      setExchangeRates(mergedRates);
      
      // Зберігаємо оновлені дані в localStorage
      saveToLocalStorage(updatedBudgets, currentId);
      
      return updatedBudgets;
    });
  }, [
    exchangeRates,
    activeBudgetId,
    setSelectedCurrencies,
    setExchangeRates,
    setBudgets
  ]);

  const handleExchangeRateChange = useCallback((pairKey: string, type: string | undefined, rate: number) => {
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      
      if (pairKey && type && (type === 'buy' || type === 'sell')) {
        const currentValue = newRates[pairKey];
        if (!isExchangeRatePair(currentValue)) {
          // Створюємо пару з 0 для обох значень, якщо її ще немає
          newRates[pairKey] = { buy: 0, sell: 0 };
        }
        const pair = newRates[pairKey];
        if (isExchangeRatePair(pair)) {
          pair[type] = rate;
        }
      } else {
        const currencyCode = pairKey;
        newRates[currencyCode] = rate;
      }
      return newRates;
    });
  }, [setExchangeRates]);

  const handleStartBalanceChange = useCallback((currencyCode: string, value: string) => {
    let numValue: number | null = null;
    if (value !== '' && value !== null && value !== undefined) {
      const parsed = parseFloat(sanitizeNumberInput(value));
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }
    
    // ВАЖЛИВО: Оновлюємо баланс безпосередньо в бюджеті для всіх валют
    const currentId = activeBudgetId || 'default';
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      const startBalances = { ...(existingBudget.startBalances || {}) };
      startBalances[currencyCode] = numValue;
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          startBalances
        }
      };
    });
  }, [activeBudgetId, setBudgets]);

  // Обробники для шифрування
  const handleEnableEncryptionClick = useCallback(() => {
    setShowEnableEncryptionModal(true);
  }, []);

  const handleDisableEncryptionClick = useCallback(() => {
    setShowDisableEncryptionModal(true);
  }, []);

  const handleEnableEncryption = useCallback(async (password: string, confirmPassword: string) => {
    if (password !== confirmPassword) {
      setAlertMessage(translate('encryption.passwordsDoNotMatch') + '!');
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!password.trim()) {
      setAlertMessage(translate('encryption.passwordCannotBeEmpty'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!user) {
      setAlertMessage(translate('encryption.authenticationRequired'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    try {
      // Встановлюємо пароль
      setEncryptionPassword(password);
      
      // Зберігаємо дані з шифруванням
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: translate('budget.defaultBudgetName'),
          startBalances: {},
          selectedCurrencies: selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: exchangeRates || {},
          days: []
        }
      };
      
      await saveToFirestore(
        user,
        budgetsToSave,
        activeBudgetId || 'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        password,
        setIsEncrypted
      );
      
      setShowEnableEncryptionModal(false);
      setAlertMessage(translate('encryption.enabled'));
      setAlertType('success');
      setShowAlertModal(true);
    } catch (error) {
      console.error('Помилка при увімкненні шифрування:', error);
      setAlertMessage(translate('encryption.enableError'));
      setAlertType('error');
      setShowAlertModal(true);
    }
  }, [user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText]);

  const handleDisableEncryption = useCallback(async (password: string) => {
    if (!password.trim()) {
      setAlertMessage(translate('encryption.enterPassword'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!user) {
      setAlertMessage(translate('encryption.authenticationRequired'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    // Перевіряємо пароль, спробувавши розшифрувати дані
    if (encryptionPassword !== password) {
      setAlertMessage(translate('encryption.wrongPassword'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    try {
      // Очищаємо пароль
      setEncryptionPassword(null);
      
      // Зберігаємо дані без шифрування
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: translate('budget.defaultBudgetName'),
          startBalances: {},
          selectedCurrencies: selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: exchangeRates || {},
          days: []
        }
      };
      
      await saveToFirestore(
        user,
        budgetsToSave,
        activeBudgetId || 'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        null,
        setIsEncrypted
      );
      
      setShowDisableEncryptionModal(false);
      setAlertMessage(translate('encryption.disabled'));
      setAlertType('success');
      setShowAlertModal(true);
    } catch (error) {
      console.error('Помилка при вимкненні шифрування:', error);
      setAlertMessage(translate('encryption.disableError'));
      setAlertType('error');
      setShowAlertModal(true);
    }
  }, [user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, encryptionPassword, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText]);

  return {
    handleClearAll,
    handleClearAllDays,
    handleStartNewMonth,
    handleConfirmStartNewMonth,
    handleCancelStartNewMonth,
    showStartNewMonthModal,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange,
    handleEnableEncryptionClick,
    handleDisableEncryptionClick,
    handleEnableEncryption,
    handleDisableEncryption,
    showEnableEncryptionModal,
    showDisableEncryptionModal,
    setShowEnableEncryptionModal,
    setShowDisableEncryptionModal,
    isEncrypted,
    showAlertModal,
    setShowAlertModal,
    alertMessage,
    alertType,
    showClearAllConfirmModal,
    setShowClearAllConfirmModal,
    handleConfirmClearAll,
    handleCancelClearAll,
    showClearAllDaysConfirmModal,
    setShowClearAllDaysConfirmModal,
    handleConfirmClearAllDays,
    handleCancelClearAllDays
  };
}

