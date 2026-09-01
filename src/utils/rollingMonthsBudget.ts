import type { Budget, Day, ExchangeRates, MonthSlice } from '../types';
import { calculateFinalBalances, calculateTotals, convertCurrency } from './calculations';
import { DEFAULT_CURRENCIES } from './currencies';
import { createEmptyMonthDays, normalizeDaysArray } from './dayHelpers';
import { formatMonthKey, shiftMonths } from './monthlyPlan';

export const MAX_STORED_MONTHS = 12;

export type { MonthSlice };

export const monthKeyFromBudgetDate = (year: number, month: number): string =>
  formatMonthKey(year, month);

/** Lexicographic YYYY-MM order matches chronological order. */
export function getSortedMonthKeys(monthsByKey: Record<string, MonthSlice> | undefined): string[] {
  if (!monthsByKey || typeof monthsByKey !== 'object') return [];
  return Object.keys(monthsByKey).sort();
}

/** First stored month in chronological order — the initial-budget (seed) month. */
export function getSeedMonthKey(monthsByKey: Record<string, MonthSlice> | undefined): string | null {
  const keys = getSortedMonthKeys(monthsByKey);
  return keys[0] ?? null;
}

/**
 * Opening balances to flush when leaving a month:
 * seed on the first stored month, otherwise that month's own stored starts.
 */
export function openingBalancesToPersist(
  monthKey: string,
  monthsByKey: Record<string, MonthSlice> | undefined,
  seedStartBalances: Record<string, number | null>
): Record<string, number | null> {
  const seedMonthKey = getSeedMonthKey(monthsByKey);
  if (seedMonthKey == null || monthKey === seedMonthKey) {
    return { ...seedStartBalances };
  }
  return { ...(monthsByKey?.[monthKey]?.startBalances || {}) };
}

/**
 * Trims the rolling window. If the oldest (seed) month is dropped, the new
 * first month's opening balances become the seed so later months keep carry-over.
 */
export function trimMonthsReanchorSeed(
  monthsByKey: Record<string, MonthSlice> | undefined,
  seedStartBalances: Record<string, number | null>,
  max: number = MAX_STORED_MONTHS,
  dropFromNewest: boolean = false
): { monthsByKey: Record<string, MonthSlice>; startBalances: Record<string, number | null> } {
  const oldFirst = getSeedMonthKey(monthsByKey);
  const { trimmed, droppedKeys } = trimRollingMonthsToMax(monthsByKey, max, dropFromNewest);
  const newFirst = getSeedMonthKey(trimmed);
  const seedDropped = Boolean(
    oldFirst && newFirst && oldFirst !== newFirst && droppedKeys.includes(oldFirst)
  );
  return {
    monthsByKey: trimmed,
    startBalances: seedDropped
      ? { ...(trimmed[newFirst!]?.startBalances || seedStartBalances) }
      : { ...seedStartBalances }
  };
}

export const getCurrentCalendarBudgetDate = (): { year: number; month: number } => {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() };
};

/** True when the viewed month is today's calendar month (0–11). */
export const isViewingCurrentCalendarMonth = (year: number, month: number): boolean => {
  const now = getCurrentCalendarBudgetDate();
  return year === now.year && month === now.month;
};

/**
 * Trims to at most `max` months. When `dropFromNewest` is false (default rolling forward),
 * the lexicographically smallest (oldest) keys are removed. When true (jumping backward in time),
 * the largest (newest) keys are removed.
 */
export function trimRollingMonthsToMax<T>(
  monthsByKey: Record<string, T> | undefined,
  max: number = MAX_STORED_MONTHS,
  dropFromNewest: boolean = false
): { trimmed: Record<string, T>; droppedKeys: string[] } {
  if (!monthsByKey || typeof monthsByKey !== 'object') {
    return { trimmed: {}, droppedKeys: [] };
  }
  const keys = Object.keys(monthsByKey).sort();
  if (keys.length <= max) {
    return { trimmed: { ...monthsByKey }, droppedKeys: [] };
  }
  const dropCount = keys.length - max;
  const droppedKeys: string[] = [];
  const keep = new Set<string>();
  if (dropFromNewest) {
    for (let i = 0; i < keys.length - dropCount; i++) {
      keep.add(keys[i]);
    }
    for (let i = keys.length - dropCount; i < keys.length; i++) {
      droppedKeys.push(keys[i]);
    }
  } else {
    for (let i = dropCount; i < keys.length; i++) {
      keep.add(keys[i]);
    }
    for (let i = 0; i < dropCount; i++) {
      droppedKeys.push(keys[i]);
    }
  }
  const trimmed: Record<string, T> = {};
  keep.forEach((k) => {
    trimmed[k] = monthsByKey[k];
  });
  return { trimmed, droppedKeys };
}

/** Lexicographic YYYY-MM order matches chronological order. */
export function trimOldestMonthKeys<T>(
  monthsByKey: Record<string, T> | undefined,
  max: number = MAX_STORED_MONTHS
): Record<string, T> {
  return trimRollingMonthsToMax(monthsByKey, max, false).trimmed;
}

export function buildEmptyMonthSlice(
  year: number,
  month: number,
  selectedCurrencies: string[]
): MonthSlice {
  const days = createEmptyMonthDays(year, month);
  const startBalances: Record<string, number | null> = {};
  (selectedCurrencies.length ? selectedCurrencies : DEFAULT_CURRENCIES).forEach((c) => {
    startBalances[c] = null;
  });
  return { days, startBalances };
}

/** Move legacy flat `days` / balances into `monthsByKey` once. */
export function migrateBudgetToMonthsByKey(budget: Budget): Budget {
  const bd = budget.budgetDate || getCurrentCalendarBudgetDate();
  const key = monthKeyFromBudgetDate(bd.year, bd.month);
  let monthsByKey = { ...(budget.monthsByKey || {}) };

  if (!monthsByKey[key] && Array.isArray(budget.days) && budget.days.length > 0) {
    monthsByKey[key] = {
      days: budget.days,
      startBalances: { ...(budget.startBalances || {}) }
    };
  } else if (!monthsByKey[key] && (!budget.monthsByKey || Object.keys(budget.monthsByKey).length === 0)) {
    monthsByKey[key] = buildEmptyMonthSlice(
      bd.year,
      bd.month,
      budget.selectedCurrencies || DEFAULT_CURRENCIES
    );
  }

  monthsByKey = trimOldestMonthKeys(monthsByKey);
  return { ...budget, monthsByKey };
}

export function trimMonthsOnBudget(budget: Budget): Budget {
  if (!budget.monthsByKey) return budget;
  const { monthsByKey, startBalances } = trimMonthsReanchorSeed(
    budget.monthsByKey,
    budget.startBalances || {}
  );
  return { ...budget, monthsByKey, startBalances };
}

/**
 * On cold load: always show the current calendar month; persist the previously
 * visible month slice under its key before switching.
 * The initial budget (seed) stays on the first stored month — it is not copied
 * onto the new calendar month.
 */
export function applyBootToCurrentCalendarMonth(budget: Budget): Budget {
  let b = migrateBudgetToMonthsByKey(budget);
  const now = getCurrentCalendarBudgetDate();
  const nowKey = monthKeyFromBudgetDate(now.year, now.month);
  const bd = b.budgetDate || now;
  const savedKey = monthKeyFromBudgetDate(bd.year, bd.month);
  const seed = { ...(b.startBalances || {}) };

  if (savedKey === nowKey) {
    return trimMonthsOnBudget(b);
  }

  let monthsByKey = { ...(b.monthsByKey || {}) };
  const seedMonthKey = getSeedMonthKey(monthsByKey) ?? savedKey;
  monthsByKey[savedKey] = {
    days: b.days || [],
    startBalances: openingBalancesToPersist(savedKey, monthsByKey, seed),
    ...(savedKey !== seedMonthKey && monthsByKey[savedKey]?.startBalancesManual
      ? { startBalancesManual: true as const }
      : {})
  };

  const existingNow = monthsByKey[nowKey];
  const slice =
    existingNow && Array.isArray(existingNow.days)
      ? {
          days: normalizeDaysArray(existingNow.days, now.year, now.month),
          startBalances: {
            ...(existingNow.startBalances || {})
          },
          ...(existingNow.startBalancesManual ? { startBalancesManual: true as const } : {})
        }
      : buildEmptyMonthSlice(now.year, now.month, b.selectedCurrencies || DEFAULT_CURRENCIES);

  monthsByKey[nowKey] = slice;

  return trimMonthsOnBudget({
    ...b,
    budgetDate: now,
    days: slice.days,
    startBalances: seed,
    monthsByKey
  });
}

/** Rolling 12 calendar months ending at (endYear, endMonth) inclusive. */
export function getTwelveMonthWindowEndingAt(endYear: number, endMonth: number) {
  const start = shiftMonths(endYear, endMonth, -(MAX_STORED_MONTHS - 1));
  const keys: { year: number; month: number; key: string }[] = [];
  for (let i = 0; i < MAX_STORED_MONTHS; i++) {
    const { year, month } = shiftMonths(start.year, start.month, i);
    keys.push({ year, month, key: monthKeyFromBudgetDate(year, month) });
  }
  return keys;
}

/** Twelve consecutive months starting at (startYear, startMonth) — first slot is that month. */
export function getTwelveMonthWindowStartingAt(startYear: number, startMonth: number) {
  const keys: { year: number; month: number; key: string }[] = [];
  for (let i = 0; i < MAX_STORED_MONTHS; i++) {
    const { year, month } = shiftMonths(startYear, startMonth, i);
    keys.push({ year, month, key: monthKeyFromBudgetDate(year, month) });
  }
  return keys;
}

/** 12-month overview: left-to-right from the current calendar month forward. */
export function getDefaultOverviewWindow() {
  const { year, month } = getCurrentCalendarBudgetDate();
  return getTwelveMonthWindowStartingAt(year, month);
}

export interface OverviewMonthBalanceRow {
  key: string;
  year: number;
  month: number;
  balance: number;
}

function sumFinalBalancesInDisplayCurrency(
  finalBalances: Record<string, number>,
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): number {
  let total = 0;
  selectedCurrencies.forEach((code) => {
    const bal = finalBalances[`finalBalance${code}`] || 0;
    total += convertCurrency(bal, code, displayCurrency, exchangeRates);
  });
  return total;
}

/** End-of-month total in display currency for one stored month slice. */
export function computeSliceEndBalanceDisplay(
  slice: MonthSlice | undefined,
  year: number,
  month: number,
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): number {
  const currencies = selectedCurrencies.length ? selectedCurrencies : DEFAULT_CURRENCIES;
  const days = slice?.days?.length ? slice.days : createEmptyMonthDays(year, month);
  const startBalances = slice?.startBalances ?? {};
  const totals = calculateTotals(days, currencies);
  const finals = calculateFinalBalances(days, currencies, startBalances, totals);
  return sumFinalBalancesInDisplayCurrency(finals, currencies, displayCurrency, exchangeRates);
}

/**
 * Projected end-of-month balances for the default 12-month window
 * (current calendar month first, then 11 future months).
 */
export function buildTwelveMonthBalanceRows(args: {
  monthsByKey: Record<string, MonthSlice> | undefined;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  /** When the active UI month matches a window slot, use live days/startBalances. */
  activeMonthKey?: string;
  activeDays?: Day[];
  activeStartBalances?: Record<string, number | null>;
}): OverviewMonthBalanceRow[] {
  const {
    monthsByKey,
    selectedCurrencies,
    displayCurrency,
    exchangeRates,
    activeMonthKey,
    activeDays,
    activeStartBalances
  } = args;

  return getDefaultOverviewWindow().map(({ year, month, key }) => {
    let slice = monthsByKey?.[key];
    if (activeMonthKey === key && activeDays) {
      slice = { days: activeDays, startBalances: activeStartBalances ?? {} };
    }
    return {
      key,
      year,
      month,
      balance: computeSliceEndBalanceDisplay(
        slice,
        year,
        month,
        selectedCurrencies,
        displayCurrency,
        exchangeRates
      )
    };
  });
}

export function mergeMonthSliceIntoBudget(
  budget: Budget,
  monthKey: string,
  slice: MonthSlice
): Budget {
  const monthsByKey = trimOldestMonthKeys({
    ...(budget.monthsByKey || {}),
    [monthKey]: slice
  });
  return { ...budget, monthsByKey };
}
