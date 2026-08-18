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
