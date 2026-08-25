import { Day, MonthSlice, Transaction } from '../types';
import { getDaysInMonth } from './dateHelpers';
import { normalizeDaysArray } from './dayHelpers';
import { formatMonthKey, parseMonthKey } from './monthlyPlan';
import {
  buildEmptyMonthSlice,
  getDefaultOverviewWindow,
  MAX_STORED_MONTHS,
  trimRollingMonthsToMax
} from './rollingMonthsBudget';
import {
  countMonthTransactions,
  countTransactionsInDays,
  MAX_TRANSACTIONS_PER_MONTH
} from './transactionLimits';

const stampTransactionDate = (
  transaction: Transaction,
  year: number,
  monthIndex: number,
  day: number
): Transaction => {
  let hours = 12;
  let minutes = 0;
  let seconds = 0;

  if (transaction.date) {
    const parsed =
      typeof transaction.date === 'string' ? new Date(transaction.date) : new Date(transaction.date);
    if (!Number.isNaN(parsed.getTime())) {
      hours = parsed.getHours();
      minutes = parsed.getMinutes();
      seconds = parsed.getSeconds();
    }
  }

  return {
    ...transaction,
    date: new Date(year, monthIndex, day, hours, minutes, seconds)
  };
};

export interface MoveTransactionsResult {
  nextDays: Day[];
  movedCount: number;
}

/**
 * Moves selected transactions onto another day of the same month.
 * Transactions already on the target day are left in place.
 */
export const moveTransactionsToDay = (
  days: Day[],
  transactionIds: string[],
  targetDayNumber: number,
  year: number,
  monthIndex: number
): MoveTransactionsResult => {
  if (!Array.isArray(days) || days.length === 0) {
    return { nextDays: days, movedCount: 0 };
  }

  const targetIndex = targetDayNumber - 1;
  if (targetIndex < 0 || targetIndex >= days.length) {
    return { nextDays: days, movedCount: 0 };
  }

  const idSet = new Set(transactionIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (idSet.size === 0) {
    return { nextDays: days, movedCount: 0 };
  }

  const moving: Transaction[] = [];
  const movingIds = new Set<string>();

  days.forEach((day, index) => {
    if (index === targetIndex || !day || !Array.isArray(day.transactions)) return;
    day.transactions.forEach((tx) => {
      if (!tx?.id || !idSet.has(tx.id) || movingIds.has(tx.id)) return;
      moving.push(tx);
      movingIds.add(tx.id);
    });
  });

  if (moving.length === 0) {
    return { nextDays: days, movedCount: 0 };
  }

  const stamped = moving.map((tx) => stampTransactionDate(tx, year, monthIndex, targetDayNumber));

  const nextDays = days.map((day, index) => {
    const txs = Array.isArray(day?.transactions) ? day.transactions : [];

    if (index === targetIndex) {
      const kept = txs.filter((tx) => !tx?.id || !movingIds.has(tx.id));
      return {
        ...day,
        transactions: [...kept, ...stamped]
      };
    }

    if (!txs.some((tx) => tx?.id && movingIds.has(tx.id))) {
      return day;
    }

    return {
      ...day,
      transactions: txs.filter((tx) => !tx?.id || !movingIds.has(tx.id))
    };
  });

  return { nextDays, movedCount: moving.length };
};

export interface CollectedTransaction {
  day: number;
  transaction: Transaction;
}

export const collectTransactionsByIds = (
  days: Day[],
  transactionIds: string[]
): CollectedTransaction[] => {
  const idSet = new Set(transactionIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (idSet.size === 0 || !Array.isArray(days)) return [];

  const collected: CollectedTransaction[] = [];
  const seen = new Set<string>();

  days.forEach((day) => {
    if (!day || !Array.isArray(day.transactions)) return;
    day.transactions.forEach((tx) => {
      if (!tx?.id || !idSet.has(tx.id) || seen.has(tx.id)) return;
      collected.push({ day: day.day, transaction: tx });
      seen.add(tx.id);
    });
  });

  return collected;
};

export interface DeleteTransactionsResult {
  nextDays: Day[];
  deletedCount: number;
}

export const deleteTransactionsByIds = (
  days: Day[],
  transactionIds: string[]
): DeleteTransactionsResult => {
  if (!Array.isArray(days) || days.length === 0) {
    return { nextDays: days, deletedCount: 0 };
  }

  const idSet = new Set(transactionIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (idSet.size === 0) {
    return { nextDays: days, deletedCount: 0 };
  }

  let deletedCount = 0;
  const nextDays = days.map((day) => {
    const txs = Array.isArray(day?.transactions) ? day.transactions : [];
    if (!txs.some((tx) => tx?.id && idSet.has(tx.id))) return day;

    const kept = txs.filter((tx) => {
      if (tx?.id && idSet.has(tx.id)) {
        deletedCount += 1;
        return false;
      }
      return true;
    });

    return { ...day, transactions: kept };
  });

  return { nextDays, deletedCount };
};

export interface TransactionEditPatch {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  category?: string;
}

export interface ApplyTransactionEditsResult {
  nextDays: Day[];
  updatedCount: number;
}

export const applyTransactionEdits = (
  days: Day[],
  patches: TransactionEditPatch[]
): ApplyTransactionEditsResult => {
  if (!Array.isArray(days) || days.length === 0 || !Array.isArray(patches) || patches.length === 0) {
    return { nextDays: days, updatedCount: 0 };
  }

  const patchById = new Map<string, TransactionEditPatch>();
  patches.forEach((patch) => {
    if (patch?.id) patchById.set(patch.id, patch);
  });
  if (patchById.size === 0) {
    return { nextDays: days, updatedCount: 0 };
  }

  let updatedCount = 0;
  const nextDays = days.map((day) => {
    const txs = Array.isArray(day?.transactions) ? day.transactions : [];
    let changed = false;
    const nextTxs = txs.map((tx) => {
      if (!tx?.id) return tx;
      const patch = patchById.get(tx.id);
      if (!patch) return tx;
      changed = true;
      updatedCount += 1;
      const nextTx: Transaction = {
        ...tx,
        type: patch.type,
        amount: patch.amount,
        currency: patch.currency,
        description: patch.description
      };
      if (patch.category) nextTx.category = patch.category;
      else delete nextTx.category;
      return nextTx;
    });

    return changed ? { ...day, transactions: nextTxs } : day;
  });

  return { nextDays, updatedCount };
};

export interface MoveTargetMonth {
  year: number;
  month: number;
  key: string;
}

/**
 * Months a transaction can be moved to: the currently viewed month, every stored
 * slice, and the default 12-month overview window (current calendar month + 11).
 */
export const listMoveTargetMonths = (
  monthsByKey: Record<string, MonthSlice> | undefined,
  activeYear: number,
  activeMonth: number,
  windowMonths: { year: number; month: number; key: string }[] = getDefaultOverviewWindow()
): MoveTargetMonth[] => {
  const keys = new Set<string>();
  keys.add(formatMonthKey(activeYear, activeMonth));
  Object.keys(monthsByKey || {}).forEach((key) => keys.add(key));
  windowMonths.forEach((item) => {
    if (item?.key) keys.add(item.key);
  });

  return Array.from(keys)
    .sort()
    .map((key) => parseMonthKey(key))
    .filter((parsed): parsed is MoveTargetMonth => parsed !== null);
};

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

export type MoveTransactionsToMonthError =
  | 'invalid-target'
  | 'nothing-to-move'
  | 'month-limit'
  | 'would-drop-data';

export interface MoveTransactionsToMonthRequest {
  transactionIds: string[];
  targetYear: number;
  targetMonth: number;
  targetDay: number;
}

export interface MoveTransactionsToMonthParams extends MoveTransactionsToMonthRequest {
  sourceDays: Day[];
  sourceYear: number;
  sourceMonth: number;
  monthsByKey: Record<string, MonthSlice> | undefined;
  selectedCurrencies?: string[];
  maxPerMonth?: number;
}

export interface MoveTransactionsToMonthResult {
  nextSourceDays: Day[];
  nextMonthsByKey: Record<string, MonthSlice>;
  movedCount: number;
  error?: MoveTransactionsToMonthError;
  limitExisting?: number;
  limitAdding?: number;
  limitMax?: number;
}

/**
 * Moves selected transactions from the viewed month onto a day in any allowed month.
 * Same-month moves reuse `moveTransactionsToDay`. Cross-month moves keep transaction ids.
 */
export const moveTransactionsToMonth = (
  params: MoveTransactionsToMonthParams
): MoveTransactionsToMonthResult => {
  const {
    sourceDays,
    sourceYear,
    sourceMonth,
    monthsByKey,
    transactionIds,
    targetYear,
    targetMonth,
    targetDay,
    selectedCurrencies = ['UAH', 'USD', 'EUR'],
    maxPerMonth = MAX_TRANSACTIONS_PER_MONTH
  } = params;

  const currentMonths = monthsByKey || {};
  const unchanged = (error?: MoveTransactionsToMonthError): MoveTransactionsToMonthResult => ({
    nextSourceDays: sourceDays,
    nextMonthsByKey: currentMonths,
    movedCount: 0,
    ...(error ? { error } : {})
  });

  const daysInTarget = getDaysInMonth(targetYear, targetMonth);
  if (targetDay < 1 || targetDay > daysInTarget) {
    return unchanged('invalid-target');
  }

  const sourceKey = formatMonthKey(sourceYear, sourceMonth);
  const destKey = formatMonthKey(targetYear, targetMonth);

  if (sourceKey === destKey) {
    const { nextDays, movedCount } = moveTransactionsToDay(
      sourceDays,
      transactionIds,
      targetDay,
      targetYear,
      targetMonth
    );
    if (movedCount === 0) {
      return unchanged('nothing-to-move');
    }

    return {
      nextSourceDays: nextDays,
      nextMonthsByKey: {
        ...currentMonths,
        [sourceKey]: sliceWithDays(
          currentMonths[sourceKey],
          nextDays,
          sourceYear,
          sourceMonth,
          selectedCurrencies
        )
      },
      movedCount
    };
  }

  const collected = collectTransactionsByIds(sourceDays, transactionIds);
  if (collected.length === 0) {
    return unchanged('nothing-to-move');
  }

  const destExistingCount = countMonthTransactions(
    destKey,
    currentMonths,
    sourceKey,
    sourceDays
  );
  if (destExistingCount + collected.length > maxPerMonth) {
    return {
      ...unchanged('month-limit'),
      limitExisting: destExistingCount,
      limitAdding: collected.length,
      limitMax: maxPerMonth
    };
  }

  const { nextDays: nextSourceDays } = deleteTransactionsByIds(
    sourceDays,
    collected.map((item) => item.transaction.id)
  );

  const destSlice = currentMonths[destKey];
  const destDays = normalizeDaysArray(destSlice?.days, targetYear, targetMonth);
  const movingIds = new Set(collected.map((item) => item.transaction.id));
  const stamped = collected.map((item) =>
    stampTransactionDate(item.transaction, targetYear, targetMonth, targetDay)
  );
  const destIndex = targetDay - 1;
  const nextDestDays = destDays.map((day, index) => {
    if (index !== destIndex) {
      if (!Array.isArray(day?.transactions)) return day;
      if (!day.transactions.some((tx) => tx?.id && movingIds.has(tx.id))) return day;
      return {
        ...day,
        transactions: day.transactions.filter((tx) => !tx?.id || !movingIds.has(tx.id))
      };
    }
    const txs = Array.isArray(day.transactions) ? day.transactions : [];
    const kept = txs.filter((tx) => !tx?.id || !movingIds.has(tx.id));
    return { ...day, day: targetDay, transactions: [...kept, ...stamped] };
  });

  const nextMonths: Record<string, MonthSlice> = {
    ...currentMonths,
    [sourceKey]: sliceWithDays(
      currentMonths[sourceKey],
      nextSourceDays,
      sourceYear,
      sourceMonth,
      selectedCurrencies
    ),
    [destKey]: sliceWithDays(
      destSlice,
      nextDestDays,
      targetYear,
      targetMonth,
      selectedCurrencies
    )
  };

  const { trimmed, droppedKeys } = trimRollingMonthsToMax(nextMonths, MAX_STORED_MONTHS, false);
  if (!trimmed[destKey]) {
    return unchanged('would-drop-data');
  }

  const droppedWithData = droppedKeys.filter((key) => {
    const daysForKey = key === sourceKey ? nextSourceDays : nextMonths[key]?.days;
    return countTransactionsInDays(daysForKey) > 0;
  });
  if (droppedWithData.length > 0) {
    return unchanged('would-drop-data');
  }

  return {
    nextSourceDays,
    nextMonthsByKey: trimmed,
    movedCount: collected.length
  };
};
