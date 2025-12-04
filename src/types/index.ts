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
  /** @deprecated Використовуйте startBalances замість цього поля */
  startBalanceUAH?: number | null;
  /** @deprecated Використовуйте startBalances замість цього поля */
  startBalanceUSD?: number | null;
  /** @deprecated Використовуйте startBalances замість цього поля */
  startBalanceEUR?: number | null;
  /** Початкові баланси для всіх валют. Ключ - код валюти (UAH, USD, EUR, PLN, RON, тощо) */
  startBalances?: Record<string, number | null>;
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
  // Legacy fields (для зворотної сумісності при завантаженні старих даних)
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances замість цього поля */
  startBalanceUAH?: number | null;
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances замість цього поля */
  startBalanceUSD?: number | null;
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances замість цього поля */
  startBalanceEUR?: number | null;
  usdRate?: number;
  eurRate?: number;
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
  // Encryption fields
  isEncrypted?: boolean;
  encryptedData?: string;
}

