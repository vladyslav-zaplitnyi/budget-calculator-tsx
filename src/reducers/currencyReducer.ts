import { ExchangeRates } from '../types';

export const currencyActions = {
  SET_SELECTED_CURRENCIES: 'SET_SELECTED_CURRENCIES',
  SET_EXCHANGE_RATES: 'SET_EXCHANGE_RATES',
  SET_START_BALANCE_UAH: 'SET_START_BALANCE_UAH',
  SET_START_BALANCE_USD: 'SET_START_BALANCE_USD',
  SET_START_BALANCE_EUR: 'SET_START_BALANCE_EUR',
  UPDATE_EXCHANGE_RATE: 'UPDATE_EXCHANGE_RATE',
  RESET_BALANCES: 'RESET_BALANCES'
} as const;

export interface CurrencyState {
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  startBalanceUAH: number | null;
  startBalanceUSD: number | null;
  startBalanceEUR: number | null;
}

export type CurrencyAction =
  | { type: typeof currencyActions.SET_SELECTED_CURRENCIES; payload: string[] }
  | { type: typeof currencyActions.SET_EXCHANGE_RATES; payload: ExchangeRates }
  | { type: typeof currencyActions.SET_START_BALANCE_UAH; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_USD; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_EUR; payload: number | null }
  | { type: typeof currencyActions.UPDATE_EXCHANGE_RATE; payload: ExchangeRates }
  | { type: typeof currencyActions.RESET_BALANCES };

const initialState: CurrencyState = {
  selectedCurrencies: ['UAH', 'USD', 'EUR'],
  exchangeRates: {},
  startBalanceUAH: null,
  startBalanceUSD: null,
  startBalanceEUR: null
};

export function currencyReducer(state: CurrencyState, action: CurrencyAction): CurrencyState {
  switch (action.type) {
    case currencyActions.SET_SELECTED_CURRENCIES:
      return {
        ...state,
        selectedCurrencies: action.payload
      };
    
    case currencyActions.SET_EXCHANGE_RATES:
      return {
        ...state,
        exchangeRates: action.payload
      };
    
    case currencyActions.SET_START_BALANCE_UAH:
      return {
        ...state,
        startBalanceUAH: action.payload
      };
    
    case currencyActions.SET_START_BALANCE_USD:
      return {
        ...state,
        startBalanceUSD: action.payload
      };
    
    case currencyActions.SET_START_BALANCE_EUR:
      return {
        ...state,
        startBalanceEUR: action.payload
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
        startBalanceUAH: null,
        startBalanceUSD: null,
        startBalanceEUR: null
      };
    
    default:
      return state;
  }
}

export function createCurrencyInitialState(loadedData: unknown): CurrencyState {
  // Type guard для перевірки структури даних
  const data = loadedData as Record<string, unknown> | null | undefined;
  return {
    ...initialState,
    selectedCurrencies: (data && Array.isArray(data.selectedCurrencies)) 
      ? data.selectedCurrencies as string[] 
      : initialState.selectedCurrencies,
    exchangeRates: (data && typeof data.exchangeRates === 'object' && data.exchangeRates !== null)
      ? data.exchangeRates as ExchangeRates
      : initialState.exchangeRates,
    startBalanceUAH: (data && (typeof data.startBalanceUAH === 'number' || data.startBalanceUAH === null))
      ? data.startBalanceUAH as number | null
      : null,
    startBalanceUSD: (data && (typeof data.startBalanceUSD === 'number' || data.startBalanceUSD === null))
      ? data.startBalanceUSD as number | null
      : null,
    startBalanceEUR: (data && (typeof data.startBalanceEUR === 'number' || data.startBalanceEUR === null))
      ? data.startBalanceEUR as number | null
      : null
  };
}

