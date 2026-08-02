import type { Budget, Day, MonthSlice } from '../types';
import { calculateFinalBalances, calculateTotals } from './calculations';
import { DEFAULT_CURRENCIES } from './currencies';
import { roundToDecimals } from './rounding';
import {
  buildEmptyMonthSlice,
  getCurrentCalendarBudgetDate,
  monthKeyFromBudgetDate,
  trimRollingMonthsToMax
} from './rollingMonthsBudget';

export function getSortedMonthKeys(monthsByKey: Record<string, MonthSlice> | undefined): string[] {
  if (!monthsByKey || typeof monthsByKey !== 'object') return [];
  return Object.keys(monthsByKey).sort();
}

function roundStartBalances(
  balances: Record<string, number | null>
): Record<string, number | null> {
  const next: Record<string, number | null> = {};
  Object.entries(balances).forEach(([code, value]) => {
    next[code] = value === null || value === undefined ? null : roundToDecimals(value, 2);
  });
  return next;
}

/** Preserve optional manual flag when rewriting a month slice. */
export function buildMonthSlice(
  days: Day[],
  startBalances: Record<string, number | null>,
  startBalancesManual?: boolean
): MonthSlice {
  const slice: MonthSlice = {
    days,
    startBalances: roundStartBalances(startBalances)
  };
  if (startBalancesManual) {
    slice.startBalancesManual = true;
  }
  return slice;
}

/** Top-level `Budget.startBalances` — the user-entered seed for the current calendar month. */
export function getSeedStartBalances(budget: Budget): Record<string, number | null> {
  return roundStartBalances({ ...(budget.startBalances || {}) });
}

/**
 * Effective opening balances for a stored month (after waterfall):
 * seed on the calendar-month anchor, carry-over on later months.
 */
export function getEffectiveMonthStartBalances(
  monthsByKey: Record<string, MonthSlice> | undefined,
  monthKey: string,
  seedStartBalances?: Record<string, number | null>
): Record<string, number | null> {
  const sliceStarts = monthsByKey?.[monthKey]?.startBalances;
  if (sliceStarts && Object.keys(sliceStarts).length > 0) {
    return roundStartBalances({ ...sliceStarts });
  }
  return roundStartBalances({ ...(seedStartBalances || {}) });
}

/**
 * Chains starting balances from the **current calendar month** forward:
 * - Top-level `startBalances` is the seed and is never replaced by a viewed month.
 * - Anchor month slice starts = seed.
 * - Each later month starts at the previous month's closing balance.
 * - Months before the calendar month keep their stored starts (historical).
 * - Only `days` are mirrored from the active `budgetDate` slice.
 */
export function applyBalanceWaterfallToBudget(budget: Budget): Budget {
  const monthsByKey = budget.monthsByKey;
  if (!monthsByKey || Object.keys(monthsByKey).length === 0) {
    return {
      ...budget,
      startBalances: getSeedStartBalances(budget)
    };
  }

  const codes =
    budget.selectedCurrencies && budget.selectedCurrencies.length > 0
      ? budget.selectedCurrencies
      : DEFAULT_CURRENCIES;

  const seed = getSeedStartBalances(budget);
  const keys = getSortedMonthKeys(monthsByKey);
  const nextMonths: Record<string, MonthSlice> = { ...monthsByKey };
  const { year, month } = getCurrentCalendarBudgetDate();
  const anchorKey = monthKeyFromBudgetDate(year, month);
  const anchorIndex = keys.indexOf(anchorKey);

  if (anchorIndex === -1) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const slice = nextMonths[key];
      if (!slice) continue;
      nextMonths[key] = buildMonthSlice(slice.days, { ...slice.startBalances });
    }
  } else {
    for (let i = 0; i < anchorIndex; i++) {
      const key = keys[i];
      const slice = nextMonths[key];
      if (!slice) continue;
      nextMonths[key] = buildMonthSlice(slice.days, { ...slice.startBalances });
    }

    const anchorSlice = nextMonths[anchorKey];
    if (anchorSlice) {
      nextMonths[anchorKey] = buildMonthSlice(anchorSlice.days, { ...seed });
    }

    for (let i = anchorIndex + 1; i < keys.length; i++) {
      const key = keys[i];
      const slice = nextMonths[key];
      if (!slice) continue;

      const prevKey = keys[i - 1];
      const prev = nextMonths[prevKey];
      if (!prev) continue;

      const totals = calculateTotals(prev.days || [], codes);
      const closing = calculateFinalBalances(prev.days || [], codes, prev.startBalances || {}, totals);
      const derivedStart: Record<string, number | null> = {};
      codes.forEach((c) => {
        const v = closing[`finalBalance${c}`];
        derivedStart[c] =
          v !== undefined && v !== null && isFinite(v) ? roundToDecimals(v, 2) : null;
      });

      nextMonths[key] = buildMonthSlice(slice.days, {
        ...derivedStart
      });
    }
  }

  let updated: Budget = {
    ...budget,
    startBalances: seed,
    monthsByKey: nextMonths
  };

  const bd = budget.budgetDate;
  if (bd) {
    const mk = monthKeyFromBudgetDate(bd.year, bd.month);
    const active = nextMonths[mk];
    if (active) {
      updated = {
        ...updated,
        // Keep seed in top-level startBalances; only mirror the viewed month's days.
        days: active.days
      };
    }
  }

  return updated;
}

export interface MonthNavigationPreviewInput {
  monthsByKey: Record<string, MonthSlice> | undefined;
  oldDate: { year: number; month: number };
  newDate: { year: number; month: number };
  uiDays: Day[];
  uiStartBalances: Record<string, number | null>;
  selectedCurrencies: string[];
}

/**
 * Simulates persisting the current UI month, then switching to `newDate`, and trimming
 * to max 12 months (oldest dropped when jumping forward; newest dropped when backward).
 */
export function simulateMonthsAfterNavigation(
  input: MonthNavigationPreviewInput
): { exceeds: boolean; forwardJump: boolean; droppedKeys: string[] } {
  const { monthsByKey, oldDate, newDate, uiDays, uiStartBalances, selectedCurrencies } = input;
  const oldKey = monthKeyFromBudgetDate(oldDate.year, oldDate.month);
  const newKey = monthKeyFromBudgetDate(newDate.year, newDate.month);

  if (oldKey === newKey) {
    return { exceeds: false, forwardJump: false, droppedKeys: [] };
  }

  const merged: Record<string, MonthSlice> = { ...(monthsByKey || {}) };
  const { year, month } = getCurrentCalendarBudgetDate();
  const anchorKey = monthKeyFromBudgetDate(year, month);
  const oldStarts =
    oldKey === anchorKey
      ? { ...uiStartBalances }
      : { ...(merged[oldKey]?.startBalances ?? uiStartBalances) };
  merged[oldKey] = buildMonthSlice(uiDays, oldStarts);

  if (!merged[newKey]) {
    merged[newKey] = buildEmptyMonthSlice(
      newDate.year,
      newDate.month,
      selectedCurrencies.length ? selectedCurrencies : DEFAULT_CURRENCIES
    );
  }

  const forwardJump = newKey > oldKey;
  const { droppedKeys } = trimRollingMonthsToMax(merged, 12, !forwardJump);

  return {
    exceeds: droppedKeys.length > 0,
    forwardJump,
    droppedKeys
  };
}
