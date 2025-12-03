import { useCallback, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, getDefaultRate } from '../utils/currencies';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
import { saveToFirestore } from '../utils/storageHelpers';

/**
 * Hook для управління налаштуваннями бюджету (валюти, курси, баланси)
 */
export function useBudgetSettings() {
  const context = useBudgetContext();
  const {
    isUk,
    selectedCurrencies,
    setSelectedCurrencies,
    exchangeRates,
    setExchangeRates,
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setUsdRate,
    setEurRate,
    activeBudgetId,
    budgets,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    baseCurrency,
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
      setStartBalanceUAH(null);
      setStartBalanceUSD(null);
      setStartBalanceEUR(null);
      
      const defaultUsdRate = 41.5;
      const defaultEurRate = 45;
      setUsdRate(defaultUsdRate);
      setEurRate(defaultEurRate);
      
      const currentId = activeBudgetId || 'default';
      const emptyDays = createEmptyMonthDays();
      
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || { name: 'Основний' };
      
      const clearedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(currencyCode => {
        clearedStartBalances[currencyCode] = null;
      });
      
      const clearedBudget = {
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
      
      setBudgets(updatedBudgets);
      setDays(emptyDays);
      
      setLoadMessage('');
      setSaveMessage('');
      
      console.log('✅ Всі поля очищено');
    }
  }, [isUk, activeBudgetId, selectedCurrencies, budgets, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setUsdRate, setEurRate, setBudgets, setDays, setLoadMessage, setSaveMessage]);

  const handleCurrencyChange = useCallback((newCurrencies: string[]) => {
    const validated = validateSelectedCurrencies(newCurrencies);
    setSelectedCurrencies(validated);
    
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
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

      return newRates;
    });

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
      if (isExchangeRatePair(uahUsdPair)) {
        setUsdRate(uahUsdPair.buy);
      }
    }
    if (validated.includes('EUR')) {
      const uahEurPair = newRates[`${baseCurrency}_EUR`];
      if (isExchangeRatePair(uahEurPair)) {
        setEurRate(uahEurPair.buy);
      }
    }
  }, [exchangeRates, baseCurrency, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate]);

  const handleExchangeRateChange = useCallback((pairKey: string, type: string | undefined, rate: number) => {
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      
      if (pairKey && type && (type === 'buy' || type === 'sell')) {
        const currentValue = newRates[pairKey];
        if (!isExchangeRatePair(currentValue)) {
          newRates[pairKey] = { buy: 1, sell: 1 };
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

    if (!type) {
       if (pairKey === 'USD') setUsdRate(rate);
       if (pairKey === 'EUR') setEurRate(rate);
    } else {
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
          name: 'Основний',
          startBalanceUAH: null,
          startBalanceUSD: null,
          startBalanceEUR: null,
          usdRate: 41.5,
          eurRate: 45,
          selectedCurrencies: selectedCurrencies,
          exchangeRates: exchangeRates,
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
          name: 'Основний',
          startBalanceUAH: null,
          startBalanceUSD: null,
          startBalanceEUR: null,
          usdRate: 41.5,
          eurRate: 45,
          selectedCurrencies: selectedCurrencies,
          exchangeRates: exchangeRates,
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

