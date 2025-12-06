import { useCallback, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
import { saveToFirestore, saveToLocalStorage } from '../utils/storageHelpers';

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

