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
  /** Початкові баланси для всіх валют. Ключ - код валюти (UAH, USD, EUR, PLN, RON, тощо) */
  startBalances: Record<string, number | null>;
  days: Day[];
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
}

export interface Budgets {
  [key: string]: Budget;
}

export interface UserData {
  activeBudgetId: string;
  budgets: Budgets;
  savedAt?: string;
  updatedAt?: string;
  // Encryption fields
  isEncrypted?: boolean;
  encryptedData?: string;
}

// Розширена версія UserData для внутрішнього використання (computed values з активного бюджету)
export interface LoadedUserData extends UserData {
  // Computed fields з активного бюджету (для зручності в хуках)
  startBalanceUAH?: number | null;
  startBalanceUSD?: number | null;
  startBalanceEUR?: number | null;
  usdRate?: number;
  eurRate?: number;
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
}

