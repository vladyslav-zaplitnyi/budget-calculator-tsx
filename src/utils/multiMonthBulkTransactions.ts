import { Day, MonthSlice, Transaction } from '../types';
import { getDaysInMonth } from './dateHelpers';
import { generateTransactionId, normalizeDaysArray } from './dayHelpers';
import { parseMonthKey } from './monthlyPlan';
import { buildEmptyMonthSlice } from './rollingMonthsBudget';

export const MAX_TRANSACTIONS_PER_DAY = 5;

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
  resolvedDay: number;
  existing: number;
  adding: number;
}

export interface BulkAddValidationResult {
  ok: boolean;
  plan: BulkAddPlanEntry[];
  errors: BulkAddLimitError[];
}

function getDayTransactionCount(
  monthKey: string,
  dayNumber: number,
  monthsByKey: Record<string, MonthSlice>,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined
): number {
  const useActiveDays = activeMonthKey !== null && monthKey === activeMonthKey && Array.isArray(activeMonthDays);
  const days = useActiveDays
    ? activeMonthDays!
    : monthsByKey[monthKey]?.days;
  if (!Array.isArray(days)) return 0;
  const day = days[dayNumber - 1];
  return Array.isArray(day?.transactions) ? day.transactions.length : 0;
}

/**
 * Build an add plan and validate per-day limits after clamping (e.g. day 31 → 30 in April).
 * Multiple selected days that clamp to the same resolved day are counted together.
 */
export function validateMultiMonthBulkAdd(
  selectedMonthKeys: string[],
  selectedDays: number[],
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined,
  maxPerDay: number = MAX_TRANSACTIONS_PER_DAY
): BulkAddValidationResult {
  const map = monthsByKey || {};
  const plan: BulkAddPlanEntry[] = [];
  const additions = new Map<string, number>();

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
      const slotKey = `${monthKey}:${resolvedDay}`;
      additions.set(slotKey, (additions.get(slotKey) || 0) + 1);
    });
  });

  const errors: BulkAddLimitError[] = [];
  additions.forEach((adding, slotKey) => {
    const [monthKey, dayStr] = slotKey.split(':');
    const resolvedDay = parseInt(dayStr, 10);
    const existing = getDayTransactionCount(monthKey, resolvedDay, map, activeMonthKey, activeMonthDays);
    if (existing + adding > maxPerDay) {
      errors.push({ monthKey, resolvedDay, existing, adding });
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
