import { Day, MonthSlice, Transaction } from '../types';
import { getDaysInMonth } from './dateHelpers';
import { generateTransactionId, normalizeDaysArray } from './dayHelpers';
import { parseMonthKey } from './monthlyPlan';
import { buildEmptyMonthSlice } from './rollingMonthsBudget';
import { MAX_TRANSACTIONS_PER_MONTH, countMonthTransactions } from './transactionLimits';

/** Clamp a selected calendar day to the last day of the given month when needed. */
export function clampDayToMonth(day: number, year: number, month: number): number {
  const maxDay = getDaysInMonth(year, month);
  return Math.min(day, maxDay);
}

export interface BulkAddPlanEntry {
  monthKey: string;
  year: number;
  month: number;
  selectedDay: number;
  resolvedDay: number;
}

export interface BulkAddLimitError {
  monthKey: string;
  existing: number;
  adding: number;
  max: number;
}

export interface BulkAddValidationResult {
  ok: boolean;
  plan: BulkAddPlanEntry[];
  errors: BulkAddLimitError[];
}

/**
 * Build an add plan and check that no targeted month exceeds the monthly limit.
 * Days are clamped to the month first (e.g. day 31 → 30 in April), so several
 * selected days can collapse onto one day while still each adding a transaction.
 */
export function validateMultiMonthBulkAdd(
  selectedMonthKeys: string[],
  selectedDays: number[],
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined,
  maxPerMonth: number = MAX_TRANSACTIONS_PER_MONTH
): BulkAddValidationResult {
  const plan: BulkAddPlanEntry[] = [];
  const additionsByMonth = new Map<string, number>();

  selectedMonthKeys.forEach((monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;
    selectedDays.forEach((selectedDay) => {
      const resolvedDay = clampDayToMonth(selectedDay, parsed.year, parsed.month);
      plan.push({
        monthKey,
        year: parsed.year,
        month: parsed.month,
        selectedDay,
        resolvedDay
      });
      additionsByMonth.set(monthKey, (additionsByMonth.get(monthKey) || 0) + 1);
    });
  });

  const errors: BulkAddLimitError[] = [];
  additionsByMonth.forEach((adding, monthKey) => {
    const existing = countMonthTransactions(monthKey, monthsByKey, activeMonthKey, activeMonthDays);
    if (existing + adding > maxPerMonth) {
      errors.push({ monthKey, existing, adding, max: maxPerMonth });
    }
  });

  return { ok: errors.length === 0, plan, errors };
}

export interface BulkAddTransactionDraft {
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
}

export interface MultiMonthBulkTransactionDraft extends BulkAddTransactionDraft {
  monthKeys: string[];
  days: number[];
}

/**
 * Apply validated bulk additions to month slices. Returns updated monthsByKey and
 * optionally updated active-month days when the active month was touched.
 */
export function applyMultiMonthBulkAdd(
  plan: BulkAddPlanEntry[],
  draft: BulkAddTransactionDraft,
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined,
  selectedCurrencies: string[]
): {
  monthsByKey: Record<string, MonthSlice>;
  activeMonthDays: Day[] | undefined;
} {
  const nextMonths: Record<string, MonthSlice> = { ...(monthsByKey || {}) };
  let nextActiveDays = activeMonthDays;

  const byMonth = new Map<string, BulkAddPlanEntry[]>();
  plan.forEach((entry) => {
    const list = byMonth.get(entry.monthKey) || [];
    list.push(entry);
    byMonth.set(entry.monthKey, list);
  });

  byMonth.forEach((entries, monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;

    const isActive = activeMonthKey !== null && monthKey === activeMonthKey;
    const existingSlice = nextMonths[monthKey];
    const sourceDays = isActive && Array.isArray(nextActiveDays)
      ? nextActiveDays
      : existingSlice?.days;

    let days = normalizeDaysArray(sourceDays, parsed.year, parsed.month);

    entries.forEach((entry) => {
      const idx = entry.resolvedDay - 1;
      const day = days[idx] || { day: entry.resolvedDay, transactions: [], description: '' };
      const transactions = Array.isArray(day.transactions) ? [...day.transactions] : [];
      const newTx: Transaction = {
        id: generateTransactionId(),
        type: draft.type,
        amount: draft.amount,
        currency: draft.currency,
        description: draft.description
      };
      transactions.push(newTx);
      days = [...days];
      days[idx] = { ...day, day: entry.resolvedDay, transactions };
    });

    const startBalances = existingSlice?.startBalances
      ?? buildEmptyMonthSlice(parsed.year, parsed.month, selectedCurrencies).startBalances;

    nextMonths[monthKey] = { days, startBalances };

    if (isActive) {
      nextActiveDays = days;
    }
  });

  return { monthsByKey: nextMonths, activeMonthDays: nextActiveDays };
}
