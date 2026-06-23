import type { Budget, Budgets, Day, ExchangeRates, MonthSlice, UserData } from '../types';
import { monthKeyFromBudgetDate, trimOldestMonthKeys, buildEmptyMonthSlice } from './rollingMonthsBudget';
import { normalizeDaysArray } from './dayHelpers';
import { DEFAULT_CURRENCIES } from './currencies';

export const ROLLING_EXPORT_VERSION = 1 as const;

export type BudgetViewModeForExport = 'days' | 'months';

export interface SingleMonthExportPayload {
  exportVersion: typeof ROLLING_EXPORT_VERSION;
  exportKind: 'singleMonth';
  savedAt: string;
  monthKey: string;
  budgetDate: { year: number; month: number };
  days: Day[];
  startBalances: Record<string, number | null>;
  settings: {
    selectedCurrencies: string[];
    exchangeRates: ExchangeRates;
    displayCurrency?: string;
    displayCurrencyIndex?: number;
  };
}

export interface FullRollingExportPayload {
  exportVersion: typeof ROLLING_EXPORT_VERSION;
  exportKind: 'rollingState';
  savedAt: string;
  activeBudgetId: string;
  budgets: Budgets;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function buildSingleMonthExportJson(params: {
  budget: Budget;
  days: Day[];
  startBalances: Record<string, number | null>;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  displayCurrency: string;
  displayCurrencyIndex: number;
}): string {
  const bd = params.budget.budgetDate || (() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  })();
  const monthKey = monthKeyFromBudgetDate(bd.year, bd.month);
  const payload: SingleMonthExportPayload = {
    exportVersion: ROLLING_EXPORT_VERSION,
    exportKind: 'singleMonth',
    savedAt: new Date().toISOString(),
    monthKey,
    budgetDate: bd,
    days: params.days.map((d) => ({
      day: d.day,
      description: d.description || '',
      transactions: Array.isArray(d.transactions) ? d.transactions.map((t) => ({ ...t })) : []
    })),
    startBalances: { ...params.startBalances },
    settings: {
      selectedCurrencies: [...params.selectedCurrencies],
      exchangeRates: { ...params.exchangeRates },
      displayCurrency: params.displayCurrency,
      displayCurrencyIndex: params.displayCurrencyIndex
    }
  };
  return JSON.stringify(payload, null, 2);
}

export function buildFullRollingExportJson(params: {
  budgets: Budgets;
  activeBudgetId: string;
}): string {
  const trimmed: Budgets = {};
  Object.entries(params.budgets).forEach(([id, b]) => {
    if (!b) return;
    trimmed[id] = {
      ...b,
      monthsByKey: b.monthsByKey ? trimOldestMonthKeys(b.monthsByKey) : undefined
    };
  });
  const payload: FullRollingExportPayload = {
    exportVersion: ROLLING_EXPORT_VERSION,
    exportKind: 'rollingState',
    savedAt: new Date().toISOString(),
    activeBudgetId: params.activeBudgetId || 'default',
    budgets: trimmed
  };
  return JSON.stringify(payload, null, 2);
}

export type ParsedImport =
  | { kind: 'singleMonth'; data: SingleMonthExportPayload }
  | { kind: 'rollingState'; data: FullRollingExportPayload }
  | { kind: 'legacy'; data: Record<string, unknown> };

export function parseBudgetImportJson(text: string): ParsedImport | null {
  try {
    const raw = JSON.parse(text) as unknown;
    if (!isRecord(raw)) return null;
    if (raw.exportKind === 'singleMonth' && raw.exportVersion === ROLLING_EXPORT_VERSION) {
      return { kind: 'singleMonth', data: raw as unknown as SingleMonthExportPayload };
    }
    if (raw.exportKind === 'rollingState' && raw.exportVersion === ROLLING_EXPORT_VERSION) {
      return { kind: 'rollingState', data: raw as unknown as FullRollingExportPayload };
    }
    return { kind: 'legacy', data: raw };
  } catch {
    return null;
  }
}

export function applySingleMonthImportToBudget(
  targetBudget: Budget,
  payload: SingleMonthExportPayload
): Budget {
  const { year, month } = payload.budgetDate;
  const key = payload.monthKey || monthKeyFromBudgetDate(year, month);
  const days = normalizeDaysArray(payload.days || [], year, month);
  const slice: MonthSlice = {
    days,
    startBalances: { ...payload.startBalances }
  };
  const monthsByKey = trimOldestMonthKeys({
    ...(targetBudget.monthsByKey || {}),
    [key]: slice
  });
  return {
    ...targetBudget,
    budgetDate: { year, month },
    days: slice.days,
    startBalances: { ...slice.startBalances },
    selectedCurrencies: payload.settings?.selectedCurrencies?.length
      ? payload.settings.selectedCurrencies
      : targetBudget.selectedCurrencies,
    exchangeRates: payload.settings?.exchangeRates || targetBudget.exchangeRates,
    displayCurrency: payload.settings?.displayCurrency ?? targetBudget.displayCurrency,
    displayCurrencyIndex:
      payload.settings?.displayCurrencyIndex ?? targetBudget.displayCurrencyIndex,
    monthsByKey
  };
}

export function mergeRollingStateImport(
  current: Budgets,
  imported: Budgets,
  preferActiveId: string
): { budgets: Budgets; activeBudgetId: string } {
  const next: Budgets = { ...current };
  const keys = Object.keys(imported);
  const primary = imported[preferActiveId] ? preferActiveId : keys[0] || 'default';
  for (const id of keys) {
    const b = imported[id];
    if (!b) continue;
    next[id] = {
      ...b,
      monthsByKey: b.monthsByKey ? trimOldestMonthKeys(b.monthsByKey) : undefined
    };
  }
  return { budgets: next, activeBudgetId: primary };
}

/** Replace / load a full multi-budget document from a rolling export file. */
export function budgetsFromFullRollingPayload(data: FullRollingExportPayload): {
  budgets: Budgets;
  activeBudgetId: string;
} {
  const trimmed: Budgets = {};
  Object.entries(data.budgets).forEach(([id, b]) => {
    if (!b) return;
    trimmed[id] = {
      ...b,
      monthsByKey: b.monthsByKey ? trimOldestMonthKeys(b.monthsByKey) : undefined
    };
  });
  return { budgets: trimmed, activeBudgetId: data.activeBudgetId || 'default' };
}

export function ensureMonthEntryForNavigation(
  budget: Budget,
  year: number,
  month: number
): Budget {
  const key = monthKeyFromBudgetDate(year, month);
  const monthsByKey = { ...(budget.monthsByKey || {}) };
  if (!monthsByKey[key]) {
    monthsByKey[key] = buildEmptyMonthSlice(
      year,
      month,
      budget.selectedCurrencies || DEFAULT_CURRENCIES
    );
  }
  return { ...budget, monthsByKey: trimOldestMonthKeys(monthsByKey) };
}

export function userDataFromBudgets(budgets: Budgets, activeBudgetId: string): UserData {
  return {
    activeBudgetId: activeBudgetId || 'default',
    budgets,
    savedAt: new Date().toISOString()
  };
}
