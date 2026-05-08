import { ExchangeRates } from '../types';

export const currencyActions = {
  SET_SELECTED_CURRENCIES: 'SET_SELECTED_CURRENCIES',
  SET_EXCHANGE_RATES: 'SET_EXCHANGE_RATES',
  SET_START_BALANCE: 'SET_START_BALANCE',
  UPDATE_EXCHANGE_RATE: 'UPDATE_EXCHANGE_RATE',
  RESET_BALANCES: 'RESET_BALANCES',
  // Застарілі actions для зворотної сумісності (deprecated)
  SET_START_BALANCE_UAH: 'SET_START_BALANCE_UAH',
  SET_START_BALANCE_USD: 'SET_START_BALANCE_USD',
  SET_START_BALANCE_EUR: 'SET_START_BALANCE_EUR'
} as const;

export interface CurrencyState {
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  /** Динамічні початкові баланси для всіх валют. Ключ - код валюти */
  startBalances: Record<string, number | null>;
  // Застарілі поля для зворотної сумісності (deprecated)
  /** @deprecated Використовуйте startBalances.UAH замість цього */
  startBalanceUAH?: number | null;
  /** @deprecated Використовуйте startBalances.USD замість цього */
  startBalanceUSD?: number | null;
  /** @deprecated Використовуйте startBalances.EUR замість цього */
  startBalanceEUR?: number | null;
}

export type CurrencyAction =
  | { type: typeof currencyActions.SET_SELECTED_CURRENCIES; payload: string[] }
  | { type: typeof currencyActions.SET_EXCHANGE_RATES; payload: ExchangeRates | ((prev: ExchangeRates) => ExchangeRates) }
  | { type: typeof currencyActions.SET_START_BALANCE; payload: { currencyCode: string; value: number | null } }
  | { type: typeof currencyActions.UPDATE_EXCHANGE_RATE; payload: ExchangeRates }
  | { type: typeof currencyActions.RESET_BALANCES }
  // Застарілі actions для зворотної сумісності (deprecated)
  | { type: typeof currencyActions.SET_START_BALANCE_UAH; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_USD; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_EUR; payload: number | null };

const initialState: CurrencyState = {
  selectedCurrencies: ['UAH', 'USD', 'EUR'],
  exchangeRates: {},
  startBalances: {}
};

export function currencyReducer(state: CurrencyState, action: CurrencyAction): CurrencyState {
  switch (action.type) {
    case currencyActions.SET_SELECTED_CURRENCIES:
      return {
        ...state,
        selectedCurrencies: action.payload
      };
    
    case currencyActions.SET_EXCHANGE_RATES: {
      const nextExchangeRates = typeof action.payload === 'function'
        ? action.payload(state.exchangeRates)
        : action.payload;
      return {
        ...state,
        exchangeRates: nextExchangeRates
      };
    }
    
    case currencyActions.SET_START_BALANCE:
      return {
        ...state,
        startBalances: {
          ...state.startBalances,
          [action.payload.currencyCode]: action.payload.value
        },
        // Для зворотної сумісності оновлюємо також застарілі поля
        ...(action.payload.currencyCode === 'UAH' && { startBalanceUAH: action.payload.value }),
        ...(action.payload.currencyCode === 'USD' && { startBalanceUSD: action.payload.value }),
        ...(action.payload.currencyCode === 'EUR' && { startBalanceEUR: action.payload.value })
      };
    
    case currencyActions.UPDATE_EXCHANGE_RATE:
      return {
        ...state,
        exchangeRates: {
          ...state.exchangeRates,
          ...action.payload
        }
      };
    
    case currencyActions.RESET_BALANCES:
      return {
        ...state,
        startBalances: {},
        // Для зворотної сумісності
        startBalanceUAH: null,
        startBalanceUSD: null,
        startBalanceEUR: null
      };
    
    // Застарілі actions для зворотної сумісності
    case currencyActions.SET_START_BALANCE_UAH:
      return {
        ...state,
        startBalances: {
          ...state.startBalances,
          UAH: action.payload
        },
        startBalanceUAH: action.payload
      };
    
    case currencyActions.SET_START_BALANCE_USD:
      return {
        ...state,
        startBalances: {
          ...state.startBalances,
          USD: action.payload
        },
        startBalanceUSD: action.payload
      };
    
    case currencyActions.SET_START_BALANCE_EUR:
      return {
        ...state,
        startBalances: {
          ...state.startBalances,
          EUR: action.payload
        },
        startBalanceEUR: action.payload
      };
    
    default:
      return state;
  }
}

export function createCurrencyInitialState(loadedData: unknown): CurrencyState {
  // Type guard для перевірки структури даних
  const data = loadedData as Record<string, unknown> | null | undefined;
  
  // Створюємо startBalances з даних
  const startBalances: Record<string, number | null> = {};
  
  // Спочатку перевіряємо нову структуру startBalances
  if (data && typeof data.startBalances === 'object' && data.startBalances !== null) {
    const balances = data.startBalances as Record<string, unknown>;
    Object.keys(balances).forEach(currencyCode => {
      const value = balances[currencyCode];
      if (typeof value === 'number' || value === null) {
        startBalances[currencyCode] = value;
      }
    });
  }
  
  // Для зворотної сумісності перевіряємо застарілі поля
  const startBalanceUAH = (data && (typeof data.startBalanceUAH === 'number' || data.startBalanceUAH === null))
    ? data.startBalanceUAH as number | null
    : undefined;
  const startBalanceUSD = (data && (typeof data.startBalanceUSD === 'number' || data.startBalanceUSD === null))
    ? data.startBalanceUSD as number | null
    : undefined;
  const startBalanceEUR = (data && (typeof data.startBalanceEUR === 'number' || data.startBalanceEUR === null))
    ? data.startBalanceEUR as number | null
    : undefined;
  
  // Додаємо застарілі поля до startBalances, якщо вони є
  if (startBalanceUAH !== undefined) startBalances.UAH = startBalanceUAH;
  if (startBalanceUSD !== undefined) startBalances.USD = startBalanceUSD;
  if (startBalanceEUR !== undefined) startBalances.EUR = startBalanceEUR;
  
  return {
    ...initialState,
    selectedCurrencies: (data && Array.isArray(data.selectedCurrencies)) 
      ? data.selectedCurrencies as string[] 
      : initialState.selectedCurrencies,
    exchangeRates: (data && typeof data.exchangeRates === 'object' && data.exchangeRates !== null)
      ? data.exchangeRates as ExchangeRates
      : initialState.exchangeRates,
    startBalances,
    // Для зворотної сумісності залишаємо застарілі поля
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR
  };
}

