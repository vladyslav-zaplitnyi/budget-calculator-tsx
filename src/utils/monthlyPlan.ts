import { ExchangeRates, Transaction } from '../types';
import { convertCurrency } from './calculations';

/**
 * Helpers for the "12-month plan" view in the Budget tab.
 *
 * Plans are stored on the active budget under `monthlyPlans` keyed by
 * `YYYY-MM` (1-based month). Transactions are reused as a planning primitive,
 * but here their `date` is irrelevant — only the bucket (month) matters.
 *
 * The planner shows a *rolling* 12-month window starting from
 * `(plannerStartYear, plannerStartMonth)`; both values are persisted on the
 * active budget so each budget remembers its own view.
 */

export interface PlannedMonth {
  /** YYYY-MM key */
  key: string;
  /** Full year (e.g. 2026). */
  year: number;
  /** 0-indexed month (0..11). */
  month: number;
}

/** Builds a `YYYY-MM` key (month is 0-indexed, like JS Date). */
export const formatMonthKey = (year: number, month: number): string => {
  const m = String(month + 1).padStart(2, '0');
  return `${year}-${m}`;
};

/** Parses a `YYYY-MM` key back into year + 0-indexed month. */
export const parseMonthKey = (key: string): PlannedMonth | null => {
  const match = /^(\d{4})-(\d{1,2})$/.exec(String(key || ''));
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  if (Number.isNaN(year) || Number.isNaN(month) || month < 0 || month > 11) {
    return null;
  }
  return { key: formatMonthKey(year, month), year, month };
};

/** Adds `delta` months to (year, month) and returns the result, normalized. */
export const shiftMonths = (
  year: number,
  month: number,
  delta: number
): { year: number; month: number } => {
  const total = year * 12 + month + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12;
  return { year: newYear, month: newMonth };
};

/** Rolling window: `count` consecutive months starting at (startYear, startMonth). */
export const getRollingMonths = (
  startYear: number,
  startMonth: number,
  count: number = 12
): PlannedMonth[] => {
  const months: PlannedMonth[] = [];
  for (let i = 0; i < count; i += 1) {
    const { year, month } = shiftMonths(startYear, startMonth, i);
    months.push({ key: formatMonthKey(year, month), year, month });
  }
  return months;
};

/**
 * True if calendar month (year, month) is strictly before "today"'s year/month.
 * Used so "Past" in the planner matches real-world time, not the selected Budget Month.
 */
export const isCalendarMonthStrictlyPast = (
  year: number,
  month: number,
  now: Date = new Date()
): boolean => {
  const cy = now.getFullYear();
  const cm = now.getMonth();
  return year < cy || (year === cy && month < cm);
};

/** Sums planned income/expense for a single month, converted to display currency. */
export const aggregateMonthTransactions = (
  transactions: Transaction[] | undefined,
  displayCurrency: string,
  exchangeRates: ExchangeRates
): { income: number; expense: number; net: number } => {
  let income = 0;
  let expense = 0;
  if (Array.isArray(transactions)) {
    for (const t of transactions) {
      if (!t) continue;
      const amount = Number(t.amount) || 0;
      if (amount <= 0) continue;
      const currency = String(t.currency || displayCurrency).toUpperCase();
      const converted = convertCurrency(amount, currency, displayCurrency, exchangeRates);
      if (t.type === 'income') {
        income += converted;
      } else {
        expense += converted;
      }
    }
  }
  return { income, expense, net: income - expense };
};

export interface BuildPlannerRowsArgs {
  /** Months in chronological order (the visible 12). */
  months: PlannedMonth[];
  /** Map of month key -> planned transactions. */
  monthlyPlans: Record<string, Transaction[]>;
  /** Balance (in display currency) at the end of the current budget month. */
  startingBalance: number;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  /**
   * The current budget month (0-indexed) and year. Forecast contributions
   * start *after* this month.
   */
  budgetYear: number;
  budgetMonth: number;
  /** Optional "today" for tests; defaults to `new Date()`. */
  referenceDate?: Date;
}

export interface PlannerRow extends PlannedMonth {
  transactions: Transaction[];
  income: number;
  expense: number;
  net: number;
  /** Cumulative balance at end of this month, or null if month is at/before budget. */
  cumulative: number | null;
  /** Month is strictly before the current calendar month (read-only in planner). */
  isPast: boolean;
}

/**
 * Build planner rows. Cumulative is computed by walking from the first month
 * after the budget month forward through the latest visible month so the
 * forecast stays consistent even when the user scrolls the window forward.
 */
export const buildPlannerRows = ({
  months,
  monthlyPlans,
  startingBalance,
  displayCurrency,
  exchangeRates,
  budgetYear,
  budgetMonth,
  referenceDate
}: BuildPlannerRowsArgs): PlannerRow[] => {
  if (months.length === 0) return [];

  const now = referenceDate ?? new Date();

  const forecastStart = shiftMonths(budgetYear, budgetMonth, 1);
  const lastVisible = months[months.length - 1];

  const cumulativeMap = new Map<string, number>();
  let cumulative = Number.isFinite(startingBalance) ? startingBalance : 0;
  let cur = { ...forecastStart };
  while (
    cur.year < lastVisible.year ||
    (cur.year === lastVisible.year && cur.month <= lastVisible.month)
  ) {
    const key = formatMonthKey(cur.year, cur.month);
    const transactions = monthlyPlans[key];
    const { net } = aggregateMonthTransactions(transactions, displayCurrency, exchangeRates);
    cumulative += net;
    cumulativeMap.set(key, cumulative);
    cur = shiftMonths(cur.year, cur.month, 1);
  }

  return months.map((m) => {
    const transactions = Array.isArray(monthlyPlans[m.key]) ? monthlyPlans[m.key] : [];
    const agg = aggregateMonthTransactions(transactions, displayCurrency, exchangeRates);
    const isPast = isCalendarMonthStrictlyPast(m.year, m.month, now);
    return {
      ...m,
      transactions,
      income: agg.income,
      expense: agg.expense,
      net: agg.net,
      cumulative: cumulativeMap.has(m.key) ? cumulativeMap.get(m.key)! : null,
      isPast
    };
  });
};

/** Default rolling window start = next month after the current budget month. */
export const getDefaultPlannerStart = (
  budgetYear: number,
  budgetMonth: number
): { year: number; month: number } => shiftMonths(budgetYear, budgetMonth, 1);
