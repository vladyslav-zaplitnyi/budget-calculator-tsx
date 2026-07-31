import { Day, MonthSlice, Transaction } from '../types';
import {
  MAX_TRANSACTIONS_PER_MONTH,
  canAddToMonth,
  countMonthTransactions,
  countTransactionsInDays,
  getRemainingMonthCapacity,
  shouldWarnAboutMonthUsage
} from './transactionLimits';
import { validateMultiMonthBulkAdd } from './multiMonthBulkTransactions';

function tx(id: string): Transaction {
  return { id, type: 'expense', amount: 1, currency: 'UAH', description: id };
}

/** 31 days where day 1 holds `perDay[0]` transactions, day 2 `perDay[1]`, etc. */
function buildDays(perDay: number[]): Day[] {
  return Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    description: '',
    transactions: Array.from({ length: perDay[i] || 0 }, (_, j) => tx(`d${i + 1}-${j}`))
  }));
}

function buildSlice(perDay: number[]): MonthSlice {
  return { days: buildDays(perDay), startBalances: {} };
}

describe('countTransactionsInDays', () => {
  it('сумує транзакції по всіх днях місяця', () => {
    expect(countTransactionsInDays(buildDays([3, 0, 12, 1]))).toBe(16);
  });

  it('не падає на порожніх та некоректних даних', () => {
    expect(countTransactionsInDays(undefined)).toBe(0);
    expect(countTransactionsInDays([])).toBe(0);
    expect(countTransactionsInDays([{ day: 1 } as Day])).toBe(0);
  });

  it('не має ліміту на кількість транзакцій в одному дні', () => {
    expect(countTransactionsInDays(buildDays([50]))).toBe(50);
  });
});

describe('countMonthTransactions', () => {
  const monthsByKey: Record<string, MonthSlice> = {
    '2026-07': buildSlice([2, 2]),
    '2026-08': buildSlice([5])
  };

  it('бере активний місяць з актуальних days, а не зі зрізу', () => {
    const activeDays = buildDays([9]);
    expect(countMonthTransactions('2026-07', monthsByKey, '2026-07', activeDays)).toBe(9);
  });

  it('бере неактивні місяці з monthsByKey', () => {
    expect(countMonthTransactions('2026-08', monthsByKey, '2026-07', buildDays([9]))).toBe(5);
  });

  it('повертає 0 для невідомого місяця', () => {
    expect(countMonthTransactions('2030-01', monthsByKey, '2026-07', undefined)).toBe(0);
  });
});

describe('ліміт на місяць', () => {
  it('MAX_TRANSACTIONS_PER_MONTH дорівнює 300', () => {
    expect(MAX_TRANSACTIONS_PER_MONTH).toBe(300);
  });

  it('canAddToMonth дозволяє дійти рівно до ліміту', () => {
    expect(canAddToMonth(299)).toBe(true);
    expect(canAddToMonth(300)).toBe(false);
    expect(canAddToMonth(295, 5)).toBe(true);
    expect(canAddToMonth(295, 6)).toBe(false);
  });

  it('getRemainingMonthCapacity не повертає відʼємних значень', () => {
    expect(getRemainingMonthCapacity(280)).toBe(20);
    expect(getRemainingMonthCapacity(320)).toBe(0);
  });

  it('лічильник показується від 250 транзакцій', () => {
    expect(shouldWarnAboutMonthUsage(249)).toBe(false);
    expect(shouldWarnAboutMonthUsage(250)).toBe(true);
  });
});

describe('validateMultiMonthBulkAdd', () => {
  const activeMonthKey = '2026-07';

  it('дозволяє масове додавання, поки місяць вміщається в ліміт', () => {
    const result = validateMultiMonthBulkAdd(
      ['2026-07', '2026-08'],
      [1, 2, 3],
      { '2026-08': buildSlice([1]) },
      activeMonthKey,
      buildDays([2]),
      MAX_TRANSACTIONS_PER_MONTH
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.plan).toHaveLength(6);
  });

  it('блокує місяць, у якому пакет перевищує ліміт', () => {
    const almostFull = buildDays([MAX_TRANSACTIONS_PER_MONTH - 2]);
    const result = validateMultiMonthBulkAdd(
      ['2026-07'],
      [1, 2, 3],
      {},
      activeMonthKey,
      almostFull,
      MAX_TRANSACTIONS_PER_MONTH
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        monthKey: '2026-07',
        existing: MAX_TRANSACTIONS_PER_MONTH - 2,
        adding: 3,
        max: MAX_TRANSACTIONS_PER_MONTH
      }
    ]);
  });

  it('перевіряє кожен місяць окремо', () => {
    const result = validateMultiMonthBulkAdd(
      ['2026-07', '2026-08'],
      [1, 2],
      { '2026-08': buildSlice([MAX_TRANSACTIONS_PER_MONTH - 1]) },
      activeMonthKey,
      buildDays([10]),
      MAX_TRANSACTIONS_PER_MONTH
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.monthKey)).toEqual(['2026-08']);
  });

  it('рахує дні, що злилися після обрізання, як окремі транзакції', () => {
    // Лютий 2026: дні 29, 30, 31 обрізаються до 28, але додають 3 транзакції.
    const result = validateMultiMonthBulkAdd(
      ['2026-02'],
      [29, 30, 31],
      { '2026-02': buildSlice([MAX_TRANSACTIONS_PER_MONTH - 2]) },
      activeMonthKey,
      undefined,
      MAX_TRANSACTIONS_PER_MONTH
    );

    expect(result.plan.every((entry) => entry.resolvedDay === 28)).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.errors[0].adding).toBe(3);
  });

  it('дозволяє багато транзакцій в один день, поки місяць не переповнений', () => {
    const result = validateMultiMonthBulkAdd(
      ['2026-02'],
      [29, 30, 31],
      { '2026-02': buildSlice([10]) },
      activeMonthKey,
      undefined,
      MAX_TRANSACTIONS_PER_MONTH
    );

    expect(result.ok).toBe(true);
  });
});
