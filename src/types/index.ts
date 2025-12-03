export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
}

export interface Day {
  day: number;
  transactions: Transaction[];
  description?: string;
  // Legacy fields for backward compatibility
  incomeUAH?: number;
  expenseUAH?: number;
  incomeUSD?: number;
  expenseUSD?: number;
  incomeEUR?: number;
  expenseEUR?: number;
  [key: string]: any; // Allow dynamic access for legacy calculations
}

export interface CurrencyInfo {
  code: string;
  name: {
    uk: string;
    en: string;
  };
  symbol: string;
  emoji: string;
  defaultRate: number;
}

export interface ExchangeRates {
  [key: string]: number | { buy: number; sell: number } | undefined;
}

export interface Budget {
  name: string;
  startBalanceUAH?: number | null;
  startBalanceUSD?: number | null;
  startBalanceEUR?: number | null;
  usdRate?: number;
  eurRate?: number;
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
  [key: string]: any;
}

export interface Budgets {
  [key: string]: Budget;
}

export interface UserData {
  activeBudgetId?: string;
  budgets?: Budgets;
  savedAt?: string;
  updatedAt?: string;
  // Legacy fields
  startBalanceUAH?: number | null;
  startBalanceUSD?: number | null;
  startBalanceEUR?: number | null;
  usdRate?: number;
  eurRate?: number;
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
}

