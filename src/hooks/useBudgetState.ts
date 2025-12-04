import { useReducer, useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { loadFromLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray, createEmptyMonthDays } from '../utils/dayHelpers';
import { DEFAULT_CURRENCIES, validateSelectedCurrencies, getDefaultRate } from '../utils/currencies';
import { LANGUAGE_STORAGE_KEY, LANGUAGE_COOKIE_KEY } from '../utils/constants';
import { setCookie } from '../utils/cookieHelpers';
import { currencyReducer, createCurrencyInitialState, currencyActions } from '../reducers/currencyReducer';
import { budgetReducer, createBudgetInitialState, budgetActions } from '../reducers/budgetReducer';
import { displayReducer, createDisplayInitialState, displayActions } from '../reducers/displayReducer';
import { messageReducer, createMessageInitialState, messageActions } from '../reducers/messageReducer';
import { Day, ExchangeRates, Budgets } from '../types';
import { hasPairStructure, getBuyRate } from '../utils/typeGuards';
import i18n from '../i18n/config';

const BASE_CURRENCY = 'UAH';

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
        let rate: number;
        if (!rateValue) {
          rate = getDefaultRate(code);
        } else {
          rate = getBuyRate(rateValue, 1);
        }
        const pairKey = `${BASE_CURRENCY}_${code}`;
        const reversePairKey = `${code}_${BASE_CURRENCY}`;
        newRates[pairKey] = {
          buy: rate,
          sell: rate * 1.005
        };
        newRates[reversePairKey] = {
          buy: 1 / (rate * 1.005),
          sell: 1 / rate
        };
      });
      return newRates;
    }
    // Створюємо курси за замовчуванням
    const rates: ExchangeRates = {};
    const currencies = validateSelectedCurrencies(savedCurrencies || DEFAULT_CURRENCIES);
    currencies.forEach((code) => {
      if (code === BASE_CURRENCY) return;
      const rate = getDefaultRate(code);
      const pairKey = `${BASE_CURRENCY}_${code}`;
      const reversePairKey = `${code}_${BASE_CURRENCY}`;
      rates[pairKey] = {
        buy: rate,
        sell: rate * 1.005
      };
      rates[reversePairKey] = {
        buy: 1 / (rate * 1.005),
        sell: 1 / rate
      };
    });
    return rates;
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
    days: normalizeDaysArray(loadedData?.days || [])
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
    // Note: dispatch expects payload as ExchangeRates, but for updater pattern we need to handle it.
    // However, the original reducer takes just payload. 
    // The original JS code used callback: setExchangeRates(prevRates => ...)
    // But reducer dispatch usually takes object.
    // Wait, the original JS code:
    /*
      const setExchangeRates = useCallback((rates) => {
        currencyDispatch({ type: currencyActions.SET_EXCHANGE_RATES, payload: rates });
      }, []);
    */
    // The JS `useCurrencyRates` used: `setExchangeRates(prevRates => { ... })`
    // This implies `rates` argument in `setExchangeRates` callback can be a function.
    // But `currencyDispatch` expects payload. 
    // Standard useReducer dispatch doesn't support function updater for state unless the reducer handles it or we wrap it.
    // But here `setExchangeRates` is a wrapper.
    // If I pass a function to `setExchangeRates`, it passes that function as payload to `currencyDispatch`.
    // The reducer: `exchangeRates: action.payload`. If payload is function, `exchangeRates` becomes a function.
    // That would be a bug if the state is expected to be object.
    // Let's check `currencyReducer`.
    /*
    case currencyActions.SET_EXCHANGE_RATES:
      return {
        ...state,
        exchangeRates: action.payload
      };
    */
    // Yes, it just sets it. So `exchangeRates` in state would be a function.
    // But `useCurrencyRates.js` does:
    /*
    setExchangeRates(prevRates => {
        const updatedRates = { ...prevRates };
        ...
        return updatedRates;
      });
    */
    // This means the `exchangeRates` in state MUST be capable of being a function? No, React state updates support function.
    // BUT `currencyDispatch` is from `useReducer`. `dispatch` in `useReducer` takes an action object.
    // If I pass a function as payload, the payload IS the function.
    // If `useCurrencyRates` passes a function, then `action.payload` is that function.
    // The reducer sets `state.exchangeRates` to that function.
    // Then `useBudgetState` reads `currencyState.exchangeRates`.
    // If it's a function, it breaks things that expect an object.
    
    // HOWEVER, maybe the original code was relying on `useState` behavior where `setState(prev => ...)` works?
    // In `useBudgetState.js`:
    /*
    const [currencyState, currencyDispatch] = useReducer(currencyReducer, currencyInitialState);
    ...
    const setExchangeRates = useCallback((rates) => {
        currencyDispatch({ type: currencyActions.SET_EXCHANGE_RATES, payload: rates });
      }, []);
    */
    // The original code uses `useReducer`.
    // So `setExchangeRates(fn)` -> dispatch({ payload: fn }) -> state.exchangeRates = fn.
    // Then in `useCurrencyRates.js`: `setExchangeRates(prevRates => ...)`
    // This seems to imply a bug in the original code or I am missing something about `useReducer` or how `action.payload` is handled.
    // UNLESS `currencyReducer` handles functional payload? No, it doesn't look like it.
    
    // Ah, wait. `useBudgetState.js` was a refactor. Maybe `useCurrencyRates` was written for `useState` and not updated for `useReducer`?
    // The user says "src_old і там знаходяться файли з мого повністю робочого React js сайта". So it works.
    // Maybe `budgetTracker.refactored.js` uses `useBudgetState`?
    // Let's assume I need to support functional update for `setExchangeRates`.
    // I should modify the wrapper to handle it.
    
    // I need access to current `exchangeRates` to support functional update.
    // I can use a ref for currencyState or just use the current `currencyState` from closure (but that adds dependency).
    // Or I can modify the reducer to handle function payload.
    // Modifying reducer is cleaner.
    
    // Let's update `currencyReducer.ts` later to support functional payload for `SET_EXCHANGE_RATES`?
    // Or just handle it here in the wrapper.
    // I'll handle it in the wrapper using a ref for `currencyState` similar to `budgetStateRef`.
    
    // But I don't have `currencyStateRef`. I'll create it.
    
    if (typeof ratesOrUpdater === 'function') {
       const newRates = ratesOrUpdater(currencyStateRef.current.exchangeRates);
       currencyDispatch({ type: currencyActions.SET_EXCHANGE_RATES, payload: newRates });
    } else {
       currencyDispatch({ type: currencyActions.SET_EXCHANGE_RATES, payload: ratesOrUpdater });
    }
  }, []); // I need currencyStateRef in dependency? Refs are stable.


  const setActiveBudgetId = useCallback((id: string) => {
    budgetDispatch({ type: budgetActions.SET_ACTIVE_BUDGET_ID, payload: id });
  }, []);

  // Використовуємо функціональне оновлення для setBudgets та setDays
  // щоб уникнути залежностей від стану в useCallback
  // Використовуємо ref для доступу до поточного стану
  const setBudgets = useCallback((budgetsOrUpdater: Budgets | ((prev: Budgets) => Budgets)) => {
    if (typeof budgetsOrUpdater === 'function') {
      budgetDispatch({ 
        type: budgetActions.SET_BUDGETS, 
        payload: budgetsOrUpdater(budgetStateRef.current.budgets) 
      });
    } else {
      budgetDispatch({ type: budgetActions.SET_BUDGETS, payload: budgetsOrUpdater });
    }
  }, []);

  const setDays = useCallback((daysOrUpdater: Day[] | ((prev: Day[]) => Day[])) => {
    if (typeof daysOrUpdater === 'function') {
      budgetDispatch({ 
        type: budgetActions.SET_DAYS, 
        payload: daysOrUpdater(budgetStateRef.current.days) 
      });
    } else {
      budgetDispatch({ type: budgetActions.SET_DAYS, payload: daysOrUpdater });
    }
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
    // Скидаємо дні
    setDays(createEmptyMonthDays());
    
    // Скидаємо бюджети
    setBudgets({});
    
    // Скидаємо активний бюджет
    setActiveBudgetId('default');
    
    // Скидаємо вибрані валюти
    setSelectedCurrencies(DEFAULT_CURRENCIES);
    
    // Створюємо дефолтні курси обміну
    const defaultRates: ExchangeRates = {};
    DEFAULT_CURRENCIES.forEach((code) => {
      if (code === BASE_CURRENCY) return;
      let rate: number;
      if (code === 'USD') {
        rate = 41.5;
      } else if (code === 'EUR') {
        rate = 45;
      } else {
        rate = getDefaultRate(code);
      }
      const pairKey = `${BASE_CURRENCY}_${code}`;
      const reversePairKey = `${code}_${BASE_CURRENCY}`;
      defaultRates[pairKey] = {
        buy: rate,
        sell: rate * 1.005
      };
      defaultRates[reversePairKey] = {
        buy: 1 / (rate * 1.005),
        sell: 1 / rate
      };
    });
    setExchangeRates(defaultRates);
    
    // Скидаємо валюту відображення
    setDisplayCurrency('UAH');
    setDisplayCurrencyIndex(0);
  }, [
    setDays,
    setBudgets,
    setActiveBudgetId,
    setSelectedCurrencies,
    setExchangeRates,
    setDisplayCurrency,
    setDisplayCurrencyIndex
  ]);
  
  // Need currencyStateRef for setExchangeRates functional update
  const currencyStateRef = useRef(currencyState);
  useEffect(() => {
    currencyStateRef.current = currencyState;
  }, [currencyState]);

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
    setIsEncrypted
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
    setIsEncrypted
  ]);
}

