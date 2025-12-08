import { useCallback, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
import { saveToFirestore, saveToLocalStorage } from '../utils/storageHelpers';
import { calculateFinalBalances, calculateTotals } from '../utils/calculations';

/**
 * Hook для управління налаштуваннями бюджету (валюти, курси, баланси)
 */
export function useBudgetSettings() {
  const context = useBudgetContext();
  const {
    isUk,
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

  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm(
      isUk
        ? 'Ви впевнені? Це стере всі введені дані та очистить вибір файлу (файл не буде видалено з диску)!'
        : 'Are you sure? This will clear all entered data and reset the selected file (the file will not be deleted from disk)!'
    );
    
    if (confirmed) {
      const currentId = activeBudgetId || 'default';
      const emptyDays = createEmptyMonthDays();
      
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || {
        name: 'Основний',
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
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
        displayCurrencyIndex: existingBudget.displayCurrencyIndex ?? 0
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
    }
  }, [isUk, activeBudgetId, selectedCurrencies, budgets, setBudgets, setDays, setLoadMessage, setSaveMessage]);

  const handleClearAllDays = useCallback(() => {
    const confirmed = window.confirm(
      isUk
        ? 'Ви впевнені? Це стере всі дані за всі дні (транзакції, описи), але залишить початкові баланси та налаштування!'
        : 'Are you sure? This will clear all data for all days (transactions, descriptions), but will keep starting balances and settings!'
    );
    
    if (confirmed) {
      const currentId = activeBudgetId || 'default';
      const emptyDays = createEmptyMonthDays();
      
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || {
        name: 'Основний',
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
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
    }
  }, [isUk, activeBudgetId, budgets, setBudgets, setDays]);

  const handleStartNewMonth = useCallback(() => {
    setShowStartNewMonthModal(true);
  }, []);

  const handleConfirmStartNewMonth = useCallback(() => {
    const currentId = activeBudgetId || 'default';
    const safePrev = budgets || {};
    const existingBudget = safePrev[currentId] || {
      name: 'Основний',
      startBalances: {},
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: [],
      displayCurrency: 'RON',
      displayCurrencyIndex: 0
    };

    // Отримуємо поточні початкові баланси
    const currentStartBalances = existingBudget.startBalances || {};

    // Обчислюємо поточні фінальні баланси
    const totals = calculateTotals(days || [], selectedCurrencies);
    const finalBalances = calculateFinalBalances(
      days || [],
      currentStartBalances['UAH'] ?? null,
      currentStartBalances['USD'] ?? null,
      currentStartBalances['EUR'] ?? null,
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

    // Створюємо порожні дні
    const emptyDays = createEmptyMonthDays();

    // Оновлюємо бюджет: стираємо дні та встановлюємо нові початкові баланси
    const updatedBudget = {
      ...existingBudget,
      startBalances: newStartBalances,
      days: emptyDays
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
    console.log('✅ Новий місяць розпочато');
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
        name: 'Основний',
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
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }
    
    // ВАЖЛИВО: Оновлюємо баланс безпосередньо в бюджеті для всіх валют
    const currentId = activeBudgetId || 'default';
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId] || {
        name: 'Основний',
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
      alert(isUk ? 'Паролі не співпадають!' : 'Passwords do not match!');
      return;
    }

    if (!password.trim()) {
      alert(isUk ? 'Пароль не може бути порожнім!' : 'Password cannot be empty!');
      return;
    }

    if (!user) {
      alert(isUk ? 'Потрібна авторизація для шифрування!' : 'Authentication required for encryption!');
      return;
    }

    try {
      // Встановлюємо пароль
      setEncryptionPassword(password);
      
      // Зберігаємо дані з шифруванням
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: isUk ? 'Основний' : 'Main',
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
      alert(isUk ? '✅ Шифрування увімкнено!' : '✅ Encryption enabled!');
    } catch (error) {
      console.error('Помилка при увімкненні шифрування:', error);
      alert(isUk ? '❌ Помилка при увімкненні шифрування!' : '❌ Error enabling encryption!');
    }
  }, [isUk, user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText]);

  const handleDisableEncryption = useCallback(async (password: string) => {
    if (!password.trim()) {
      alert(isUk ? 'Введіть пароль!' : 'Enter password!');
      return;
    }

    if (!user) {
      alert(isUk ? 'Потрібна авторизація!' : 'Authentication required!');
      return;
    }

    // Перевіряємо пароль, спробувавши розшифрувати дані
    if (encryptionPassword !== password) {
      alert(isUk ? 'Невірний пароль!' : 'Wrong password!');
      return;
    }

    try {
      // Очищаємо пароль
      setEncryptionPassword(null);
      
      // Зберігаємо дані без шифрування
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: isUk ? 'Основний' : 'Main',
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
      alert(isUk ? '✅ Шифрування вимкнено!' : '✅ Encryption disabled!');
    } catch (error) {
      console.error('Помилка при вимкненні шифрування:', error);
      alert(isUk ? '❌ Помилка при вимкненні шифрування!' : '❌ Error disabling encryption!');
    }
  }, [isUk, user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, encryptionPassword, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText]);

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
    isEncrypted
  };
}

