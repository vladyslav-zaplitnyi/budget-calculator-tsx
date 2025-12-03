import { LANGUAGE_STORAGE_KEY } from '../utils/constants';

export const displayActions = {
  SET_DISPLAY_CURRENCY: 'SET_DISPLAY_CURRENCY',
  SET_DISPLAY_CURRENCY_INDEX: 'SET_DISPLAY_CURRENCY_INDEX',
  SET_LANGUAGE: 'SET_LANGUAGE'
} as const;

export interface DisplayState {
  displayCurrency: string;
  displayCurrencyIndex: number;
  language: string;
}

export type DisplayAction =
  | { type: typeof displayActions.SET_DISPLAY_CURRENCY; payload: string }
  | { type: typeof displayActions.SET_DISPLAY_CURRENCY_INDEX; payload: number }
  | { type: typeof displayActions.SET_LANGUAGE; payload: string };

const initialState: DisplayState = {
  displayCurrency: 'UAH',
  displayCurrencyIndex: 0,
  language: 'uk'
};

export function displayReducer(state: DisplayState, action: DisplayAction): DisplayState {
  switch (action.type) {
    case displayActions.SET_DISPLAY_CURRENCY:
      return {
        ...state,
        displayCurrency: action.payload
      };
    
    case displayActions.SET_DISPLAY_CURRENCY_INDEX:
      return {
        ...state,
        displayCurrencyIndex: action.payload
      };
    
    case displayActions.SET_LANGUAGE:
      return {
        ...state,
        language: action.payload
      };
    
    default:
      return state;
  }
}

export function createDisplayInitialState(loadedData: unknown): DisplayState {
  // Завантажуємо з localStorage для зворотної сумісності
  let displayCurrency = 'UAH';
  let displayCurrencyIndex = 0;
  
  try {
    const savedDisplayCurrency = localStorage.getItem('displayCurrency');
    if (savedDisplayCurrency && ['UAH', 'USD', 'EUR', 'PLN', 'RON'].includes(savedDisplayCurrency)) {
      displayCurrency = savedDisplayCurrency;
    }
    
    const savedIndex = localStorage.getItem('displayCurrencyIndex');
    if (savedIndex !== null && ['0', '1', '2'].includes(savedIndex)) {
      displayCurrencyIndex = parseInt(savedIndex, 10);
    }
  } catch (error) {
    console.error('Помилка при завантаженні валюти відображення:', error);
  }

  let language = 'uk';
  try {
    // Спочатку шукаємо в правильному ключі
    const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLang === 'uk' || savedLang === 'en') {
      language = savedLang;
    } else {
      // Для зворотної сумісності перевіряємо старий ключ
      const oldLang = localStorage.getItem('language');
      if (oldLang === 'uk' || oldLang === 'en') {
        language = oldLang;
        // Мігруємо в новий ключ
        localStorage.setItem(LANGUAGE_STORAGE_KEY, oldLang);
      }
    }
  } catch (error) {
    console.error('Помилка при завантаженні мови:', error);
  }

  return {
    ...initialState,
    displayCurrency,
    displayCurrencyIndex,
    language
  };
}

