import { ExchangeRates } from '../types';

export const currencyActions = {
  SET_SELECTED_CURRENCIES: 'SET_SELECTED_CURRENCIES',
  SET_EXCHANGE_RATES: 'SET_EXCHANGE_RATES',
  SET_START_BALANCE_UAH: 'SET_START_BALANCE_UAH',
  SET_START_BALANCE_USD: 'SET_START_BALANCE_USD',
  SET_START_BALANCE_EUR: 'SET_START_BALANCE_EUR',
  SET_USD_RATE: 'SET_USD_RATE',
  SET_EUR_RATE: 'SET_EUR_RATE',
  UPDATE_EXCHANGE_RATE: 'UPDATE_EXCHANGE_RATE',
  RESET_BALANCES: 'RESET_BALANCES'
} as const;

export interface CurrencyState {
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  startBalanceUAH: number | null;
  startBalanceUSD: number | null;
  startBalanceEUR: number | null;
  usdRate: number;
  eurRate: number;
}

export type CurrencyAction =
  | { type: typeof currencyActions.SET_SELECTED_CURRENCIES; payload: string[] }
  | { type: typeof currencyActions.SET_EXCHANGE_RATES; payload: ExchangeRates }
  | { type: typeof currencyActions.SET_START_BALANCE_UAH; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_USD; payload: number | null }
  | { type: typeof currencyActions.SET_START_BALANCE_EUR; payload: number | null }
  | { type: typeof currencyActions.SET_USD_RATE; payload: number }
  | { type: typeof currencyActions.SET_EUR_RATE; payload: number }
  | { type: typeof currencyActions.UPDATE_EXCHANGE_RATE; payload: ExchangeRates }
  | { type: typeof currencyActions.RESET_BALANCES };

const initialState: CurrencyState = {
  selectedCurrencies: ['UAH', 'USD', 'EUR'],
  exchangeRates: {},
  startBalanceUAH: null,
  startBalanceUSD: null,
  startBalanceEUR: null,
  usdRate: 41.5,
  eurRate: 45
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
    
    case currencyActions.SET_USD_RATE:
      return {
        ...state,
        usdRate: action.payload
      };
    
    case currencyActions.SET_EUR_RATE:
      return {
        ...state,
        eurRate: action.payload
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
        startBalanceEUR: null,
        usdRate: 41.5,
        eurRate: 45
      };
    
    default:
      return state;
  }
}

export function createCurrencyInitialState(loadedData: any): CurrencyState {
  return {
    ...initialState,
    selectedCurrencies: loadedData?.selectedCurrencies || initialState.selectedCurrencies,
    exchangeRates: loadedData?.exchangeRates || initialState.exchangeRates,
    startBalanceUAH: loadedData?.startBalanceUAH ?? null,
    startBalanceUSD: loadedData?.startBalanceUSD ?? null,
    startBalanceEUR: loadedData?.startBalanceEUR ?? null,
    usdRate: loadedData?.usdRate ?? initialState.usdRate,
    eurRate: loadedData?.eurRate ?? initialState.eurRate
  };
}

