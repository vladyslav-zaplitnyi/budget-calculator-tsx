import type { Budget, Day, MonthSlice } from '../types';
import { calculateFinalBalances, calculateTotals } from './calculations';
import { DEFAULT_CURRENCIES } from './currencies';
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

/**
 * Chains starting balances from the **current calendar month** forward: that month keeps
 * its stored starts; each later month in the window starts at the previous month's closing
 * balance. Months before the calendar month keep their stored starts (historical view).
 * Mirrors top-level `days` / `startBalances` from the active `budgetDate` slice.
 */
export function applyBalanceWaterfallToBudget(budget: Budget): Budget {
  const monthsByKey = budget.monthsByKey;
  if (!monthsByKey || Object.keys(monthsByKey).length === 0) {
    return budget;
  }

  const codes =
    budget.selectedCurrencies && budget.selectedCurrencies.length > 0
      ? budget.selectedCurrencies
      : DEFAULT_CURRENCIES;

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
      nextMonths[key] = {
        days: slice.days,
        startBalances: { ...slice.startBalances }
      };
    }
  } else {
    for (let i = 0; i <= anchorIndex; i++) {
      const key = keys[i];
      const slice = nextMonths[key];
      if (!slice) continue;
      nextMonths[key] = {
        days: slice.days,
        startBalances: { ...slice.startBalances }
      };
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
        derivedStart[c] = v !== undefined && v !== null ? v : null;
      });

      nextMonths[key] = {
        days: slice.days,
        startBalances: {
          ...slice.startBalances,
          ...derivedStart
        }
      };
    }
  }

  let updated: Budget = {
    ...budget,
    monthsByKey: nextMonths
  };

  const bd = budget.budgetDate;
  if (bd) {
    const mk = monthKeyFromBudgetDate(bd.year, bd.month);
    const active = nextMonths[mk];
    if (active) {
      updated = {
        ...updated,
        startBalances: { ...active.startBalances },
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
  merged[oldKey] = {
    days: uiDays,
    startBalances: { ...uiStartBalances }
  };

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
