import { Day, MonthSlice } from '../types';

/**
 * Global cap on transactions per month. The rolling 12-month budget is persisted
 * as a single Firestore document, so every month has to stay small enough for the
 * whole year to fit under Firebase's 1MB document limit.
 */
export const MAX_TRANSACTIONS_PER_MONTH = 300;

/** The daily view only shows the usage counter once a month gets this busy. */
export const TRANSACTIONS_COUNTER_VISIBLE_FROM = 250;

/** Sum of transactions across every day of a month. */
export function countTransactionsInDays(days: Day[] | undefined | null): number {
  if (!Array.isArray(days)) return 0;
  return days.reduce(
    (sum, day) => sum + (Array.isArray(day?.transactions) ? day.transactions.length : 0),
    0
  );
}

/**
 * Transaction count of a month in the rolling window. The active month is read
 * from `activeMonthDays`, which holds newer state than its `monthsByKey` slice.
 */
export function countMonthTransactions(
  monthKey: string,
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined
): number {
  if (activeMonthKey !== null && monthKey === activeMonthKey && Array.isArray(activeMonthDays)) {
    return countTransactionsInDays(activeMonthDays);
  }
  return countTransactionsInDays(monthsByKey?.[monthKey]?.days);
}

/** How many more transactions fit into a month that already holds `existing`. */
export function getRemainingMonthCapacity(existing: number): number {
  return Math.max(0, MAX_TRANSACTIONS_PER_MONTH - existing);
}

/** True when `adding` more transactions keeps the month within the limit. */
export function canAddToMonth(existing: number, adding: number = 1): boolean {
  return existing + adding <= MAX_TRANSACTIONS_PER_MONTH;
}

/** True when the counter should be surfaced in the daily view. */
export function shouldWarnAboutMonthUsage(count: number): boolean {
  return count >= TRANSACTIONS_COUNTER_VISIBLE_FROM;
}
