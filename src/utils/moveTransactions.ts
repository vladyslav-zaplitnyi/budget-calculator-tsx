import { Day, Transaction } from '../types';

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
