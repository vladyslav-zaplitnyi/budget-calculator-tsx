import { useReducer, useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { loadFromLocalStorage, saveToLocalStorage, createEmptyDefaultBudget } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { DEFAULT_CURRENCIES, validateSelectedCurrencies, BASE_CURRENCY } from '../utils/currencies';
import { LANGUAGE_STORAGE_KEY, LANGUAGE_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { currencyReducer, createCurrencyInitialState, currencyActions } from '../reducers/currencyReducer';
import { budgetReducer, createBudgetInitialState, budgetActions } from '../reducers/budgetReducer';
import { displayReducer, createDisplayInitialState, displayActions } from '../reducers/displayReducer';
import { messageReducer, createMessageInitialState, messageActions } from '../reducers/messageReducer';
import { Day, ExchangeRates, Budgets } from '../types';
import { hasPairStructure, getBuyRate } from '../utils/typeGuards';
import i18n from '../i18n/config';
import { roundToDecimals } from '../utils/rounding';

export interface BudgetStateInterface {
  language: string;
  setLanguage: (lang: string) => void;
  isUk: boolean;
  selectedCurrencies: string[];
  setSelectedCurrencies: (currencies: string[]) => void;
  exchangeRates: ExchangeRates;
  setExchangeRates: (rates: ExchangeRates | ((prev: ExchangeRates) => ExchangeRates)) => void;
  activeBudgetId: string;
  setActiveBudgetId: (id: string) => void;
  budgets: Budgets;
  setBudgets: (budgetsOrUpdater: Budgets | ((prev: Budgets) => Budgets)) => void;
  days: Day[];
  setDays: (daysOrUpdater: Day[] | ((prev: Day[]) => Day[])) => void;
  updateDay: (index: number, field: string, value: any) => void;
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => void;
  displayCurrencyIndex: number;
  setDisplayCurrencyIndex: (index: number) => void;
  saveMessage: string;
  setSaveMessage: (message: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  loadMessage: string;
  setLoadMessage: (message: string) => void;
  rateUpdateMessage: string;
  setRateUpdateMessage: (message: string) => void;
  isUpdatingRates: boolean;
  setIsUpdatingRates: (updating: boolean) => void;
  isInitialLoad: boolean;
  setIsInitialLoad: (loading: boolean) => void;
  baseCurrency: string;
  resetToDefaults: () => void;
  // Encryption fields
  encryptionPassword: string | null;
  setEncryptionPassword: (password: string | null) => void;
  isEncrypted: boolean;
  setIsEncrypted: (encrypted: boolean) => void;
  // Budget date
  budgetDate: { year: number; month: number };
  setBudgetDate: (date: { year: number; month: number }) => void;
}

export function useBudgetState(): BudgetStateInterface {
  // Завантажуємо дані з localStorage
  const loadedData = loadFromLocalStorage();

  // Ініціалізуємо курси обміну (потрібно зробити це перед створенням початкового стану)
  const initializeExchangeRates = (
    savedRates: ExchangeRates | null | undefined, 
    savedCurrencies: string[] | null | undefined
  ): ExchangeRates => {
    if (savedRates && typeof savedRates === 'object') {
      const hasNewStructure = hasPairStructure(savedRates);
      if (hasNewStructure) {
        return savedRates;
      }
      // Конвертуємо стару структуру в нову
      const newRates: ExchangeRates = {};
      const currencies = validateSelectedCurrencies(savedCurrencies || DEFAULT_CURRENCIES);
      currencies.forEach(code => {
        if (code === BASE_CURRENCY) return;
        let rateValue = savedRates[code];
        if (rateValue) {
          const rate = getBuyRate(rateValue, 1);
          const pairKey = `${BASE_CURRENCY}_${code}`;
          const reversePairKey = `${code}_${BASE_CURRENCY}`;
          const sellRate = roundToDecimals(rate * 1.005, 2);
          newRates[pairKey] = {
            buy: rate,
            sell: sellRate
          };
          newRates[reversePairKey] = {
            buy: 1 / sellRate,
            sell: 1 / rate
          };
        }
      });
      return newRates;
    }
    // Якщо немає збережених курсів, повертаємо порожній об'єкт
    return {};
  };

  const initialExchangeRates = initializeExchangeRates(
    loadedData?.exchangeRates,
    loadedData?.selectedCurrencies
  );

  // Створюємо початковий стан для валют
  const currencyInitialState = {
    ...createCurrencyInitialState({
      ...loadedData,
      selectedCurrencies: validateSelectedCurrencies(loadedData?.selectedCurrencies || DEFAULT_CURRENCIES),
      exchangeRates: initialExchangeRates
    })
  };

  // Використовуємо reducers замість множини useState
  const [currencyState, currencyDispatch] = useReducer(currencyReducer, currencyInitialState);
  const [budgetState, budgetDispatch] = useReducer(budgetReducer, createBudgetInitialState({
    ...loadedData,
    days: normalizeDaysArray(
      loadedData?.days || [],
      loadedData?.budgetDate?.year,
      loadedData?.budgetDate?.month
    )
  }));
  const [displayState, displayDispatch] = useReducer(displayReducer, createDisplayInitialState(loadedData));
  const [messageState, messageDispatch] = useReducer(messageReducer, createMessageInitialState());
  
  // Encryption state - НЕ зберігається в localStorage, тільки в пам'яті
  const [encryptionPassword, setEncryptionPasswordState] = useState<string | null>(null);
  const [isEncrypted, setIsEncryptedState] = useState<boolean>(false);

  // Використовуємо ref для зберігання поточного стану, щоб уникнути залежностей в useCallback
  const budgetStateRef = useRef(budgetState);
  useEffect(() => {
    budgetStateRef.current = budgetState;
  }, [budgetState]);

  const isUk = displayState.language === 'uk';

  // Створюємо обгортки для dispatch функцій (для зворотної сумісності)
  const setLanguage = useCallback((lang: string) => {
    displayDispatch({ type: displayActions.SET_LANGUAGE, payload: lang });
    // Синхронізуємо з i18next
    i18n.changeLanguage(lang);
  }, []);

  const setSelectedCurrencies = useCallback((currencies: string[]) => {
    currencyDispatch({ type: currencyActions.SET_SELECTED_CURRENCIES, payload: currencies });
  }, []);

  const setExchangeRates = useCallback((ratesOrUpdater: ExchangeRates | ((prev: ExchangeRates) => ExchangeRates)) => {
    currencyDispatch({ type: currencyActions.SET_EXCHANGE_RATES, payload: ratesOrUpdater });
  }, []);


  const setActiveBudgetId = useCallback((id: string) => {
    budgetDispatch({ type: budgetActions.SET_ACTIVE_BUDGET_ID, payload: id });
  }, []);

  // Функціональні оновлення виконує reducer, щоб послідовні dispatch не втрачали дані.
  const setBudgets = useCallback((budgetsOrUpdater: Budgets | ((prev: Budgets) => Budgets)) => {
    budgetDispatch({ type: budgetActions.SET_BUDGETS, payload: budgetsOrUpdater });
  }, []);

  const setDays = useCallback((daysOrUpdater: Day[] | ((prev: Day[]) => Day[])) => {
    budgetDispatch({ type: budgetActions.SET_DAYS, payload: daysOrUpdater });
  }, []);

  const setDisplayCurrency = useCallback((currency: string) => {
    displayDispatch({ type: displayActions.SET_DISPLAY_CURRENCY, payload: currency });
  }, []);

  const setDisplayCurrencyIndex = useCallback((index: number) => {
    displayDispatch({ type: displayActions.SET_DISPLAY_CURRENCY_INDEX, payload: index });
  }, []);

  const setSaveMessage = useCallback((message: string) => {
    messageDispatch({ type: messageActions.SET_SAVE_MESSAGE, payload: message });
  }, []);

  const setIsLoading = useCallback((loading: boolean) => {
    messageDispatch({ type: messageActions.SET_IS_LOADING, payload: loading });
  }, []);

  const setLoadMessage = useCallback((message: string) => {
    messageDispatch({ type: messageActions.SET_LOAD_MESSAGE, payload: message });
  }, []);

  const setRateUpdateMessage = useCallback((message: string) => {
    messageDispatch({ type: messageActions.SET_RATE_UPDATE_MESSAGE, payload: message });
  }, []);

  const setIsUpdatingRates = useCallback((updating: boolean) => {
    messageDispatch({ type: messageActions.SET_IS_UPDATING_RATES, payload: updating });
  }, []);

  const setIsInitialLoad = useCallback((loading: boolean) => {
    messageDispatch({ type: messageActions.SET_IS_INITIAL_LOAD, payload: loading });
  }, []);

  // Encryption setters
  const setEncryptionPassword = useCallback((password: string | null) => {
    setEncryptionPasswordState(password);
  }, []);

  const setIsEncrypted = useCallback((encrypted: boolean) => {
    setIsEncryptedState(encrypted);
  }, []);

  // Функція для оновлення дня
  const updateDay = useCallback((index: number, field: string, value: any) => {
    budgetDispatch({ 
      type: budgetActions.UPDATE_DAY, 
      payload: { index, field, value } 
    });
  }, []);

  // Функція для скидання всіх стейтів до дефолтних значень
  const resetToDefaults = useCallback(() => {
    // Використовуємо спільну функцію для створення пустого бюджету (DRY принцип)
    const emptyBudget = createEmptyDefaultBudget();
    const emptyDays = emptyBudget['default'].days;
    
    // Скидаємо дні
    setDays(emptyDays);
    
    // Скидаємо бюджети з новим порожнім бюджетом
    setBudgets(emptyBudget);
    
    // Скидаємо активний бюджет
    setActiveBudgetId('default');
    
    // Скидаємо вибрані валюти
    setSelectedCurrencies(DEFAULT_CURRENCIES);
    
    // Скидаємо курси обміну (порожній об'єкт)
    setExchangeRates({});
    
    // Скидаємо баланси валют (UAH, USD, EUR) через currency reducer
    currencyDispatch({ type: currencyActions.RESET_BALANCES });
    
    // Скидаємо валюту відображення
    setDisplayCurrency('UAH');
    setDisplayCurrencyIndex(0);
    
    // НЕ скидаємо мову - зберігаємо поточну мову користувача
    // Мова залишається такою, яку вибрав користувач
    // setLanguage('uk'); // ВИДАЛЕНО - мова не скидається при logout
    
    // Очищаємо всі повідомлення та статуси
    messageDispatch({ type: messageActions.CLEAR_MESSAGES });
    setIsLoading(false);
    setIsUpdatingRates(false);
    setIsInitialLoad(false);
    setSaveMessage('');
    setLoadMessage('');
    setRateUpdateMessage('');
    
    // Очищаємо шифрування
    setEncryptionPassword(null);
    setIsEncrypted(false);
    
    // Зберігаємо в localStorage
    saveToLocalStorage(emptyBudget, 'default');
  }, [
    setDays,
    setBudgets,
    setActiveBudgetId,
    setSelectedCurrencies,
    setExchangeRates,
    setDisplayCurrency,
    setDisplayCurrencyIndex,
    messageDispatch,
    setIsLoading,
    setIsUpdatingRates,
    setIsInitialLoad,
    setSaveMessage,
    setLoadMessage,
    setRateUpdateMessage,
    setEncryptionPassword,
    setIsEncrypted,
    currencyDispatch
  ]);
  
  // 🛡️ Страховка ініціалізації днів для "холодного старту" в інкогніто
  // Якщо завантаження завершено, але днів немає (0) — це баг першого запуску.
  // Генеруємо дефолтну структуру місяця (1-31).
  useEffect(() => {
    if (!messageState.isLoading && budgetState.days.length === 0) {
      console.log("⚡ Примусова ініціалізація днів для нового користувача");
      const defaultDays = normalizeDaysArray([]);
      setDays(defaultDays);
    }
  }, [messageState.isLoading, budgetState.days.length, setDays]);

  // Зберігаємо вибір мови та синхронізуємо з i18next
  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, displayState.language);
    } catch (error) {
      console.error('Помилка при збереженні мови в localStorage:', error);
    }

    try {
      setCookie(LANGUAGE_COOKIE_KEY, displayState.language, 365);
    } catch (error) {
      console.error('Помилка при збереженні мови в cookie:', error);
    }

    // Синхронізуємо з i18next при зміні мови (включаючи ініціалізацію)
    if (i18n.language !== displayState.language) {
      i18n.changeLanguage(displayState.language);
    }
  }, [displayState.language]);

  // Зберігаємо вибір валюти відображення
  useEffect(() => {
    try {
      localStorage.setItem('displayCurrency', displayState.displayCurrency);
      localStorage.setItem('displayCurrencyIndex', displayState.displayCurrencyIndex.toString());
    } catch (error) {
      console.error('Помилка при збереженні валюти відображення:', error);
    }
  }, [displayState.displayCurrency, displayState.displayCurrencyIndex]);

  // Функція для оновлення budgetDate активного бюджету
  const setBudgetDate = useCallback((date: { year: number; month: number }) => {
    const currentId = budgetStateRef.current.activeBudgetId || 'default';
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId];
      
      if (!existingBudget) return safePrev;
      
      // Отримуємо кількість днів у новому місяці
      const newDaysInMonth = new Date(date.year, date.month + 1, 0).getDate();
      const currentDays = existingBudget.days || [];
      
      // Створюємо новий масив днів
      let updatedDays: Day[];
      
      if (newDaysInMonth >= currentDays.length) {
        // Якщо новий місяць має більше або стільки ж днів - додаємо нові дні
        updatedDays = [...currentDays];
        for (let i = currentDays.length; i < newDaysInMonth; i++) {
          updatedDays.push({
            day: i + 1,
            transactions: [],
            description: ''
          });
        }
      } else {
        // Якщо новий місяць має менше днів - очищаємо "зайві" дні
        updatedDays = currentDays.map((day, index) => {
          if (index >= newDaysInMonth) {
            // Очищаємо дні які виходять за межі місяця
            return {
              day: day.day,
              transactions: [],
              description: ''
            };
          }
          return day;
        });
      }
      
      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          budgetDate: date,
          days: updatedDays
        }
      };
    });
    
    // Також оновлюємо days в стані
    setDays((prevDays: Day[]) => {
      const newDaysInMonth = new Date(date.year, date.month + 1, 0).getDate();
      
      if (newDaysInMonth >= prevDays.length) {
        // Додаємо нові дні
        const updatedDays = [...prevDays];
        for (let i = prevDays.length; i < newDaysInMonth; i++) {
          updatedDays.push({
            day: i + 1,
            transactions: [],
            description: ''
          });
        }
        return updatedDays;
      } else {
        // Очищаємо дні які виходять за межі місяця
        return prevDays.map((day, index) => {
          if (index >= newDaysInMonth) {
            return {
              day: day.day,
              transactions: [],
              description: ''
            };
          }
          return day;
        });
      }
    });
  }, [setBudgets, setDays]);

  // Обчислюємо поточний budgetDate з активного бюджету
  const budgetDate = useMemo(() => {
    const activeBudget = budgetState.budgets[budgetState.activeBudgetId || 'default'];
    if (activeBudget?.budgetDate) {
      return activeBudget.budgetDate;
    }
    // Якщо budgetDate не встановлено, використовуємо поточну дату
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth()
    };
  }, [budgetState.budgets, budgetState.activeBudgetId]);

  // Мемоізуємо об'єкт стану, щоб уникнути створення нового об'єкта на кожен рендер
  return useMemo(() => ({
    // Мова
    language: displayState.language,
    setLanguage,
    isUk,
    
    // Валюти
    selectedCurrencies: currencyState.selectedCurrencies,
    setSelectedCurrencies,
    exchangeRates: currencyState.exchangeRates,
    setExchangeRates,
    
    // Бюджети
    activeBudgetId: budgetState.activeBudgetId,
    setActiveBudgetId,
    budgets: budgetState.budgets,
    setBudgets,
    
    // Дні
    days: budgetState.days,
    setDays,
    updateDay,
    
    // Відображення
    displayCurrency: displayState.displayCurrency,
    setDisplayCurrency,
    displayCurrencyIndex: displayState.displayCurrencyIndex,
    setDisplayCurrencyIndex,
    
    // Статуси
    saveMessage: messageState.saveMessage,
    setSaveMessage,
    isLoading: messageState.isLoading,
    setIsLoading,
    loadMessage: messageState.loadMessage,
    setLoadMessage,
    rateUpdateMessage: messageState.rateUpdateMessage,
    setRateUpdateMessage,
    isUpdatingRates: messageState.isUpdatingRates,
    setIsUpdatingRates,
    isInitialLoad: messageState.isInitialLoad,
    setIsInitialLoad,
    
    // Константи
    baseCurrency: BASE_CURRENCY,
    
    // Функції
    resetToDefaults,
    
    // Encryption
    encryptionPassword,
    setEncryptionPassword,
    isEncrypted,
    setIsEncrypted,
    
    // Budget date
    budgetDate,
    setBudgetDate
  }), [
    displayState.language,
    displayState.displayCurrency,
    displayState.displayCurrencyIndex,
    currencyState.selectedCurrencies,
    currencyState.exchangeRates,
    budgetState.activeBudgetId,
    budgetState.budgets,
    budgetState.days,
    messageState.saveMessage,
    messageState.isLoading,
    messageState.loadMessage,
    messageState.rateUpdateMessage,
    messageState.isUpdatingRates,
    messageState.isInitialLoad,
    isUk,
    setLanguage,
    setSelectedCurrencies,
    setExchangeRates,
    setActiveBudgetId,
    setBudgets,
    setDays,
    updateDay,
    setDisplayCurrency,
    setDisplayCurrencyIndex,
    setSaveMessage,
    setIsLoading,
    setLoadMessage,
    setRateUpdateMessage,
    setIsUpdatingRates,
    setIsInitialLoad,
    resetToDefaults,
    encryptionPassword,
    setEncryptionPassword,
    isEncrypted,
    setIsEncrypted,
    budgetDate,
    setBudgetDate
  ]);
}

