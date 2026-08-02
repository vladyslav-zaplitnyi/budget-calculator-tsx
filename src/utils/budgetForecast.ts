import { Day, MonthSlice, Transaction } from '../types';
import { getDaysInMonth } from './dateHelpers';
import { generateTransactionId, normalizeDaysArray } from './dayHelpers';
import { parseMonthKey } from './monthlyPlan';
import { buildEmptyMonthSlice } from './rollingMonthsBudget';
import { MAX_TRANSACTIONS_PER_MONTH, countMonthTransactions } from './transactionLimits';
import { clampDayToMonth, BulkAddLimitError } from './multiMonthBulkTransactions';

/** Normalize description for matching recurring patterns across months. */
export function normalizeForecastDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Fingerprint: type + currency + normalized description + day of month.
 * Same name on different days are separate patterns (not duplicates of each other).
 * Amount may still vary across months for the same pattern.
 */
export function buildForecastFingerprint(
  type: Transaction['type'],
  currency: string,
  description: string,
  day: number
): string {
  return `${type}|${(currency || '').toUpperCase()}|${normalizeForecastDescription(description)}|${day}`;
}

export interface ForecastOccurrence {
  monthKey: string;
  day: number;
  amount: number;
  category?: string;
  transactionId: string;
}

export interface ForecastCandidate {
  id: string;
  fingerprint: string;
  type: 'income' | 'expense';
  currency: string;
  description: string;
  /** Suggested amount (from most recent occurrence). */
  amount: number;
  /** Day of month for this pattern (part of the match key). */
  day: number;
  category?: string;
  /** Distinct months where this pattern appears. */
  monthKeys: string[];
  occurrences: ForecastOccurrence[];
  isRecurring: boolean;
}

export interface ForecastCandidateGroups {
  recurring: ForecastCandidate[];
  unique: ForecastCandidate[];
}

interface FlatTx {
  monthKey: string;
  day: number;
  tx: Transaction;
}

function collectFlatTransactions(
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined
): FlatTx[] {
  const result: FlatTx[] = [];
  const keys = new Set<string>();

  if (monthsByKey) {
    Object.keys(monthsByKey).forEach((k) => keys.add(k));
  }
  if (activeMonthKey) {
    keys.add(activeMonthKey);
  }

  Array.from(keys)
    .sort()
    .forEach((monthKey) => {
      const isActive = activeMonthKey !== null && monthKey === activeMonthKey;
      const days =
        isActive && Array.isArray(activeMonthDays)
          ? activeMonthDays
          : monthsByKey?.[monthKey]?.days;

      if (!Array.isArray(days)) return;

      days.forEach((day) => {
        if (!day || !Array.isArray(day.transactions)) return;
        day.transactions.forEach((tx) => {
          if (!tx || typeof tx.description !== 'string') return;
          if (!tx.description.trim()) return;
          result.push({ monthKey, day: day.day, tx });
        });
      });
    });

  return result;
}

/**
 * Group existing transactions into recurring (same type+currency+description+day in 2+ months)
 * and unique (everything else — one row per distinct pattern across all months).
 * Same description on different days are separate candidates.
 */
export function buildForecastCandidates(
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined
): ForecastCandidateGroups {
  const flat = collectFlatTransactions(monthsByKey, activeMonthKey, activeMonthDays);
  const byFingerprint = new Map<string, FlatTx[]>();

  flat.forEach((item) => {
    const fp = buildForecastFingerprint(
      item.tx.type,
      item.tx.currency,
      item.tx.description,
      item.day
    );
    const list = byFingerprint.get(fp) || [];
    list.push(item);
    byFingerprint.set(fp, list);
  });

  const candidates: ForecastCandidate[] = [];

  byFingerprint.forEach((items, fingerprint) => {
    // Chronological order for "most recent"
    const sorted = [...items].sort((a, b) => {
      const monthCmp = a.monthKey.localeCompare(b.monthKey);
      if (monthCmp !== 0) return monthCmp;
      return a.day - b.day;
    });

    const monthKeys = Array.from(new Set(sorted.map((i) => i.monthKey))).sort();
    const latest = sorted[sorted.length - 1];
    const patternDay = sorted[0].day;

    candidates.push({
      id: fingerprint,
      fingerprint,
      type: latest.tx.type,
      currency: (latest.tx.currency || 'UAH').toUpperCase(),
      description: latest.tx.description.trim(),
      amount: latest.tx.amount,
      day: patternDay,
      category: latest.tx.category,
      monthKeys,
      occurrences: sorted.map((i) => ({
        monthKey: i.monthKey,
        day: i.day,
        amount: i.tx.amount,
        category: i.tx.category,
        transactionId: i.tx.id
      })),
      isRecurring: monthKeys.length >= 2
    });
  });

  const sortFn = (a: ForecastCandidate, b: ForecastCandidate) => {
    if (b.monthKeys.length !== a.monthKeys.length) {
      return b.monthKeys.length - a.monthKeys.length;
    }
    const descCmp = a.description.localeCompare(b.description, undefined, {
      sensitivity: 'base'
    });
    if (descCmp !== 0) return descCmp;
    return a.day - b.day;
  };

  const recurring = candidates.filter((c) => c.isRecurring).sort(sortFn);
  const unique = candidates.filter((c) => !c.isRecurring).sort(sortFn);

  return { recurring, unique };
}

/** Editable row the user confirms for copying into target months. */
export interface ForecastCopyItem {
  fingerprint: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  category?: string;
  day: number;
}

export interface ForecastCopyDraft {
  monthKeys: string[];
  items: ForecastCopyItem[];
}

export interface ForecastCopyPlanEntry {
  monthKey: string;
  year: number;
  month: number;
  resolvedDay: number;
  item: ForecastCopyItem;
  skippedExisting: boolean;
}

export interface ForecastCopyValidationResult {
  ok: boolean;
  plan: ForecastCopyPlanEntry[];
  /** Entries that will actually be created (not skipped). */
  createCount: number;
  errors: BulkAddLimitError[];
}

function monthHasFingerprint(
  days: Day[] | undefined,
  fingerprint: string
): boolean {
  if (!Array.isArray(days)) return false;
  return days.some(
    (day) =>
      Array.isArray(day.transactions) &&
      day.transactions.some(
        (tx) =>
          buildForecastFingerprint(tx.type, tx.currency, tx.description, day.day) ===
          fingerprint
      )
  );
}

function resolveMonthDays(
  monthKey: string,
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined
): Day[] | undefined {
  if (activeMonthKey && monthKey === activeMonthKey && Array.isArray(activeMonthDays)) {
    return activeMonthDays;
  }
  return monthsByKey?.[monthKey]?.days;
}

/**
 * Build copy plan: skip target months that already contain the same fingerprint.
 * Validates monthly transaction limits for non-skipped adds.
 */
export function validateForecastCopy(
  draft: ForecastCopyDraft,
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined,
  maxPerMonth: number = MAX_TRANSACTIONS_PER_MONTH
): ForecastCopyValidationResult {
  const plan: ForecastCopyPlanEntry[] = [];
  const additionsByMonth = new Map<string, number>();

  draft.monthKeys.forEach((monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;

    const existingDays = resolveMonthDays(
      monthKey,
      monthsByKey,
      activeMonthKey,
      activeMonthDays
    );

    draft.items.forEach((item) => {
      const resolvedDay = clampDayToMonth(item.day, parsed.year, parsed.month);
      // Match against the day where the tx would land (after clamp for short months).
      const checkFingerprint = buildForecastFingerprint(
        item.type,
        item.currency,
        item.description,
        resolvedDay
      );
      const skippedExisting = monthHasFingerprint(existingDays, checkFingerprint);
      plan.push({
        monthKey,
        year: parsed.year,
        month: parsed.month,
        resolvedDay,
        item,
        skippedExisting
      });
      if (!skippedExisting) {
        additionsByMonth.set(monthKey, (additionsByMonth.get(monthKey) || 0) + 1);
      }
    });
  });

  const errors: BulkAddLimitError[] = [];
  additionsByMonth.forEach((adding, monthKey) => {
    const existing = countMonthTransactions(
      monthKey,
      monthsByKey,
      activeMonthKey,
      activeMonthDays
    );
    if (existing + adding > maxPerMonth) {
      errors.push({ monthKey, existing, adding, max: maxPerMonth });
    }
  });

  const createCount = plan.filter((e) => !e.skippedExisting).length;

  return { ok: errors.length === 0, plan, createCount, errors };
}

/**
 * Apply forecast copy plan into monthsByKey (and active days when touched).
 */
export function applyForecastCopy(
  plan: ForecastCopyPlanEntry[],
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey: string | null,
  activeMonthDays: Day[] | undefined,
  selectedCurrencies: string[]
): {
  monthsByKey: Record<string, MonthSlice>;
  activeMonthDays: Day[] | undefined;
  addedCount: number;
  skippedCount: number;
} {
  const nextMonths: Record<string, MonthSlice> = { ...(monthsByKey || {}) };
  let nextActiveDays = activeMonthDays;
  let addedCount = 0;
  let skippedCount = 0;

  const byMonth = new Map<string, ForecastCopyPlanEntry[]>();
  plan.forEach((entry) => {
    if (entry.skippedExisting) {
      skippedCount += 1;
      return;
    }
    const list = byMonth.get(entry.monthKey) || [];
    list.push(entry);
    byMonth.set(entry.monthKey, list);
  });

  byMonth.forEach((entries, monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;

    const isActive = activeMonthKey !== null && monthKey === activeMonthKey;
    const existingSlice = nextMonths[monthKey];
    const sourceDays =
      isActive && Array.isArray(nextActiveDays)
        ? nextActiveDays
        : existingSlice?.days;

    let days = normalizeDaysArray(sourceDays, parsed.year, parsed.month);

    entries.forEach((entry) => {
      const idx = entry.resolvedDay - 1;
      const maxDay = getDaysInMonth(parsed.year, parsed.month);
      if (idx < 0 || idx >= maxDay) return;

      const day = days[idx] || { day: entry.resolvedDay, transactions: [], description: '' };
      const transactions = Array.isArray(day.transactions) ? [...day.transactions] : [];
      const newTx: Transaction = {
        id: generateTransactionId(),
        type: entry.item.type,
        amount: entry.item.amount,
        currency: entry.item.currency,
        description: entry.item.description
      };
      if (entry.item.category) {
        newTx.category = entry.item.category;
      }
      transactions.push(newTx);
      days = [...days];
      days[idx] = { ...day, day: entry.resolvedDay, transactions };
      addedCount += 1;
    });

    const startBalances =
      existingSlice?.startBalances ??
      buildEmptyMonthSlice(parsed.year, parsed.month, selectedCurrencies).startBalances;

    nextMonths[monthKey] = {
      days,
      startBalances,
      ...(existingSlice?.startBalancesManual ? { startBalancesManual: true } : {})
    };

    if (isActive) {
      nextActiveDays = days;
    }
  });

  return { monthsByKey: nextMonths, activeMonthDays: nextActiveDays, addedCount, skippedCount };
}
