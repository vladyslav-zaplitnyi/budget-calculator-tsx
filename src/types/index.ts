export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  date?: Date | string; // Optional for backwards compatibility
  /** ID категорії зі статичного списку (utils/categories.ts). Відсутнє = без категорії. */
  category?: string;
}

export interface Day {
  day: number;
  transactions: Transaction[];
  description?: string;
}

/** One calendar month of data inside the rolling (max 12) store. */
export interface MonthSlice {
  days: Day[];
  startBalances: Record<string, number | null>;
  /**
   * When true, balance waterfall must not overwrite `startBalances` for this month
   * (user manually set the starting budget).
   */
  startBalancesManual?: boolean;
}

/** Snapshot for 12-month navigation warnings when changing the active budget month. */
export interface RollingMonthNavigationPreview {
  monthsByKey: Record<string, MonthSlice> | undefined;
  budgetDate: { year: number; month: number };
  uiDays: Day[];
  uiStartBalances: Record<string, number | null>;
  selectedCurrencies: string[];
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
  /**
   * Заплановані транзакції для майбутніх місяців.
   * Ключ — у форматі "YYYY-MM" (місяць 01-12).
   * Використовується режимом "12-month plan" на сторінці бюджету.
   */
  monthlyPlans?: Record<string, Transaction[]>;
  /** Рік початку 12-місячного вікна планувальника (для збереження між сесіями). */
  plannerStartYear?: number;
  /** Місяць (0-11) початку 12-місячного вікна планувальника. */
  plannerStartMonth?: number;
  /** Ключ "YYYY-MM" місяця, який зараз розгорнуто в планувальнику. */
  plannerExpandedMonth?: string | null;
  /**
   * Rolling window (max 12) of month files keyed by `YYYY-MM`.
   * The viewed month mirrors `days` on this object; `startBalances` here is the
   * seed for the first stored month, not necessarily the viewed month.
   */
  monthsByKey?: Record<string, MonthSlice>;
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

/** One Firestore document under `users/{uid}/budgetBooks/{id}` (workspace). */
export interface BudgetBookSummary {
  id: string;
  isReadOnly: boolean;
  displayLabel: string;
}
