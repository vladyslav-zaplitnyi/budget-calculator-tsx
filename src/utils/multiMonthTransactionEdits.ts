import { Day, MonthSlice, Transaction } from '../types';
import { OverviewTransaction } from './budgetInsights';
import { normalizeDaysArray } from './dayHelpers';
import {
  descriptionGroupKey,
  UNNAMED_DESCRIPTION_KEY
} from './expenseDescriptionBreakdown';
import { parseMonthKey } from './monthlyPlan';
import {
  applyTransactionEdits,
  collectTransactionsByIds,
  CollectedTransaction,
  deleteTransactionsByIds,
  TransactionEditPatch
} from './moveTransactions';
import { buildEmptyMonthSlice } from './rollingMonthsBudget';

export { descriptionGroupKey, UNNAMED_DESCRIPTION_KEY };

export interface OverviewDescriptionGroup {
  key: string;
  name: string;
  transactions: OverviewTransaction[];
  income: number;
  expense: number;
}

const sliceWithDays = (
  existing: MonthSlice | undefined,
  days: Day[],
  year: number,
  month: number,
  selectedCurrencies: string[]
): MonthSlice => {
  const startBalances =
    existing?.startBalances ??
    buildEmptyMonthSlice(year, month, selectedCurrencies).startBalances;
  const next: MonthSlice = { days, startBalances };
  if (existing?.startBalancesManual) next.startBalancesManual = true;
  return next;
};

const resolveMonthDays = (
  monthKey: string,
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey?: string | null,
  activeDays?: Day[]
): Day[] | undefined => {
  if (activeMonthKey && monthKey === activeMonthKey && Array.isArray(activeDays)) {
    return activeDays;
  }
  return monthsByKey?.[monthKey]?.days;
};

const listEditableMonthKeys = (
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeMonthKey?: string | null
): string[] => {
  const keys = new Set<string>(Object.keys(monthsByKey || {}));
  if (activeMonthKey) keys.add(activeMonthKey);
  return Array.from(keys).sort();
};

export const groupOverviewTransactionsByDescription = (
  transactions: OverviewTransaction[],
  locale = 'en'
): OverviewDescriptionGroup[] => {
  const byKey = new Map<string, OverviewTransaction[]>();

  transactions.forEach((transaction) => {
    const key = descriptionGroupKey(transaction.description);
    const list = byKey.get(key) || [];
    list.push(transaction);
    byKey.set(key, list);
  });

  return Array.from(byKey.entries())
    .map(([key, groupTransactions]) => {
      const sorted = [...groupTransactions].sort((a, b) => {
        if (a.monthKey !== b.monthKey) return a.monthKey.localeCompare(b.monthKey);
        return a.day - b.day;
      });
      const firstNamed = sorted.find((item) => (item.description || '').trim());
      let income = 0;
      let expense = 0;
      sorted.forEach((item) => {
        if (item.type === 'income') income += item.convertedAmount;
        else expense += item.convertedAmount;
      });
      return {
        key,
        name: firstNamed?.description.trim() || '',
        transactions: sorted,
        income,
        expense
      };
    })
    .sort((a, b) => {
      if (b.transactions.length !== a.transactions.length) {
        return b.transactions.length - a.transactions.length;
      }
      const nameA = a.name || a.key;
      const nameB = b.name || b.key;
      return nameA.localeCompare(nameB, locale, { sensitivity: 'base' });
    });
};

export const collectTransactionsAcrossMonths = (
  monthsByKey: Record<string, MonthSlice> | undefined,
  transactionIds: string[],
  activeMonthKey?: string | null,
  activeDays?: Day[]
): CollectedTransaction[] => {
  const idSet = new Set(transactionIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (idSet.size === 0) return [];

  const byId = new Map<string, CollectedTransaction>();

  listEditableMonthKeys(monthsByKey, activeMonthKey).forEach((monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;
    const days = resolveMonthDays(monthKey, monthsByKey, activeMonthKey, activeDays);
    if (!Array.isArray(days)) return;

    collectTransactionsByIds(days, Array.from(idSet)).forEach((item) => {
      if (byId.has(item.transaction.id)) return;
      byId.set(item.transaction.id, {
        ...item,
        year: parsed.year,
        month: parsed.month,
        monthKey
      });
    });
  });

  const ordered: CollectedTransaction[] = [];
  const seen = new Set<string>();
  transactionIds.forEach((id) => {
    const item = byId.get(id);
    if (!item || seen.has(id)) return;
    ordered.push(item);
    seen.add(id);
  });
  byId.forEach((item, id) => {
    if (seen.has(id)) return;
    ordered.push(item);
    seen.add(id);
  });
  return ordered;
};

export interface ApplyEditsAcrossMonthsResult {
  nextMonthsByKey: Record<string, MonthSlice>;
  nextActiveDays?: Day[];
  updatedCount: number;
}

export const applyTransactionEditsAcrossMonths = ({
  monthsByKey,
  patches,
  activeMonthKey,
  activeDays,
  selectedCurrencies = ['UAH', 'USD', 'EUR']
}: {
  monthsByKey: Record<string, MonthSlice> | undefined;
  patches: TransactionEditPatch[];
  activeMonthKey?: string | null;
  activeDays?: Day[];
  selectedCurrencies?: string[];
}): ApplyEditsAcrossMonthsResult => {
  const currentMonths = { ...(monthsByKey || {}) };
  if (!Array.isArray(patches) || patches.length === 0) {
    return { nextMonthsByKey: currentMonths, nextActiveDays: activeDays, updatedCount: 0 };
  }

  const patchIds = new Set(patches.map((patch) => patch.id).filter(Boolean));
  let updatedCount = 0;
  let nextActiveDays = activeDays;
  const nextMonths = { ...currentMonths };

  listEditableMonthKeys(currentMonths, activeMonthKey).forEach((monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;
    const sourceDays = resolveMonthDays(monthKey, currentMonths, activeMonthKey, nextActiveDays);
    if (!Array.isArray(sourceDays) || sourceDays.length === 0) return;
    if (!sourceDays.some((day) => (day?.transactions || []).some((tx) => tx?.id && patchIds.has(tx.id)))) {
      return;
    }

    const days = normalizeDaysArray(sourceDays, parsed.year, parsed.month);
    const { nextDays, updatedCount: monthUpdated } = applyTransactionEdits(days, patches);
    if (monthUpdated === 0) return;

    updatedCount += monthUpdated;
    nextMonths[monthKey] = sliceWithDays(
      nextMonths[monthKey] || currentMonths[monthKey],
      nextDays,
      parsed.year,
      parsed.month,
      selectedCurrencies
    );
    if (activeMonthKey && monthKey === activeMonthKey) {
      nextActiveDays = nextDays;
    }
  });

  return { nextMonthsByKey: nextMonths, nextActiveDays, updatedCount };
};

export interface DeleteAcrossMonthsResult {
  nextMonthsByKey: Record<string, MonthSlice>;
  nextActiveDays?: Day[];
  deletedCount: number;
}

export const deleteTransactionsByIdsAcrossMonths = ({
  monthsByKey,
  transactionIds,
  activeMonthKey,
  activeDays,
  selectedCurrencies = ['UAH', 'USD', 'EUR']
}: {
  monthsByKey: Record<string, MonthSlice> | undefined;
  transactionIds: string[];
  activeMonthKey?: string | null;
  activeDays?: Day[];
  selectedCurrencies?: string[];
}): DeleteAcrossMonthsResult => {
  const currentMonths = { ...(monthsByKey || {}) };
  const idSet = new Set(transactionIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (idSet.size === 0) {
    return { nextMonthsByKey: currentMonths, nextActiveDays: activeDays, deletedCount: 0 };
  }

  let deletedCount = 0;
  let nextActiveDays = activeDays;
  const nextMonths = { ...currentMonths };

  listEditableMonthKeys(currentMonths, activeMonthKey).forEach((monthKey) => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return;
    const sourceDays = resolveMonthDays(monthKey, currentMonths, activeMonthKey, nextActiveDays);
    if (!Array.isArray(sourceDays) || sourceDays.length === 0) return;
    if (!sourceDays.some((day) => (day?.transactions || []).some((tx) => tx?.id && idSet.has(tx.id)))) {
      return;
    }

    const days = normalizeDaysArray(sourceDays, parsed.year, parsed.month);
    const { nextDays, deletedCount: monthDeleted } = deleteTransactionsByIds(
      days,
      Array.from(idSet)
    );
    if (monthDeleted === 0) return;

    deletedCount += monthDeleted;
    nextMonths[monthKey] = sliceWithDays(
      nextMonths[monthKey] || currentMonths[monthKey],
      nextDays,
      parsed.year,
      parsed.month,
      selectedCurrencies
    );
    if (activeMonthKey && monthKey === activeMonthKey) {
      nextActiveDays = nextDays;
    }
  });

  return { nextMonthsByKey: nextMonths, nextActiveDays, deletedCount };
};

export const amountsMatchAcross = (transactions: Transaction[]): boolean => {
  if (transactions.length <= 1) return true;
  const first = transactions[0];
  return transactions.every(
    (item) => item.amount === first.amount && item.currency === first.currency
  );
};
