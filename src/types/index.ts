export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  date?: Date | string; // Optional for backwards compatibility
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
  regions?: {
    uk: string[];
    en: string[];
  };
}

export interface ExchangeRates {
  [key: string]: number | { buy: number; sell: number } | undefined;
}

export interface Budget {
  name: string;
  /** Початкові баланси для всіх валют. Ключ - код валюти (UAH, USD, EUR, PLN, RON, CZK, тощо) */
  startBalances: Record<string, number | null>;
  days: Day[];
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  /** Валюта для відображення конвертованих сум */
  displayCurrency?: string;
  /** Індекс валюти для відображення */
  displayCurrencyIndex?: number;
  /** Дата бюджету (рік і місяць, 0-11) */
  budgetDate?: {
    year: number;
    month: number;
  };
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
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances.UAH замість цього */
  startBalanceUAH?: number | null;
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances.USD замість цього */
  startBalanceUSD?: number | null;
  /** @deprecated Використовуйте budgets[activeBudgetId].startBalances.EUR замість цього */
  startBalanceEUR?: number | null;
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
  budgetDate?: Budget['budgetDate'];
}

