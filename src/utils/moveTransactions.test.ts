import { Day, MonthSlice, Transaction } from '../types';
import { formatMonthKey, shiftMonths } from './monthlyPlan';
import { MAX_STORED_MONTHS } from './rollingMonthsBudget';
import { MAX_TRANSACTIONS_PER_MONTH } from './transactionLimits';
import {
  applyTransactionEdits,
  collectTransactionsByIds,
  deleteTransactionsByIds,
  listMoveTargetMonths,
  moveTransactionsToDay,
  moveTransactionsToMonth
} from './moveTransactions';

const tx = (
  id: string,
  description: string,
  extra?: Partial<Transaction>
): Transaction => ({
  id,
  type: 'expense',
  amount: 10,
  currency: 'UAH',
  description,
  ...extra
});

const makeDays = (): Day[] => [
  { day: 1, description: '', transactions: [tx('a', 'Coffee'), tx('b', 'Lunch')] },
  { day: 2, description: '', transactions: [tx('c', 'Taxi')] },
  { day: 3, description: '', transactions: [] }
];

test('moves a single transaction to another day', () => {
  const { nextDays, movedCount } = moveTransactionsToDay(makeDays(), ['a'], 3, 2026, 7);

  expect(movedCount).toBe(1);
  expect(nextDays[0].transactions.map((t) => t.id)).toEqual(['b']);
  expect(nextDays[2].transactions.map((t) => t.id)).toEqual(['a']);
  expect(nextDays[2].transactions[0].description).toBe('Coffee');
});

test('moves several transactions from different days in day order', () => {
  const { nextDays, movedCount } = moveTransactionsToDay(makeDays(), ['c', 'a'], 3, 2026, 7);

  expect(movedCount).toBe(2);
  expect(nextDays[0].transactions.map((t) => t.id)).toEqual(['b']);
  expect(nextDays[1].transactions.map((t) => t.id)).toEqual([]);
  expect(nextDays[2].transactions.map((t) => t.id)).toEqual(['a', 'c']);
});

test('moves only the transactions that are not already on the target day', () => {
  const days = makeDays();
  const { nextDays, movedCount } = moveTransactionsToDay(days, ['a', 'c'], 2, 2026, 7);

  expect(movedCount).toBe(1);
  expect(nextDays[0].transactions.map((t) => t.id)).toEqual(['b']);
  expect(nextDays[1].transactions.map((t) => t.id)).toEqual(['c', 'a']);
});

test('leaves transactions that are already on the target day', () => {
  const days = makeDays();
  const { nextDays, movedCount } = moveTransactionsToDay(days, ['c'], 2, 2026, 7);

  expect(movedCount).toBe(0);
  expect(nextDays).toBe(days);
});

test('does not mutate the original days array', () => {
  const original = makeDays();
  const snapshot = JSON.parse(JSON.stringify(original));
  moveTransactionsToDay(original, ['a'], 3, 2026, 7);
  expect(original).toEqual(snapshot);
});

test('updates the transaction date to the target day and keeps the original time', () => {
  const days: Day[] = [
    {
      day: 1,
      description: '',
      transactions: [tx('a', 'Coffee', { date: new Date(2026, 7, 1, 9, 30, 15) })]
    },
    { day: 2, description: '', transactions: [] }
  ];

  const { nextDays } = moveTransactionsToDay(days, ['a'], 2, 2026, 7);
  const movedDate = new Date(nextDays[1].transactions[0].date as Date);

  expect(movedDate.getFullYear()).toBe(2026);
  expect(movedDate.getMonth()).toBe(7);
  expect(movedDate.getDate()).toBe(2);
  expect(movedDate.getHours()).toBe(9);
  expect(movedDate.getMinutes()).toBe(30);
  expect(movedDate.getSeconds()).toBe(15);
});

test('returns the original array for an invalid target day', () => {
  const days = makeDays();
  const { nextDays, movedCount } = moveTransactionsToDay(days, ['a'], 99, 2026, 7);
  expect(movedCount).toBe(0);
  expect(nextDays).toBe(days);
});

test('collects selected transactions in day order', () => {
  const collected = collectTransactionsByIds(makeDays(), ['c', 'a']);
  expect(collected.map((item) => item.transaction.id)).toEqual(['a', 'c']);
  expect(collected.map((item) => item.day)).toEqual([1, 2]);
});

test('deletes selected transactions from multiple days', () => {
  const days = makeDays();
  const { nextDays, deletedCount } = deleteTransactionsByIds(days, ['a', 'c']);

  expect(deletedCount).toBe(2);
  expect(nextDays[0].transactions.map((t) => t.id)).toEqual(['b']);
  expect(nextDays[1].transactions).toEqual([]);
  expect(days[0].transactions).toHaveLength(2);
});

test('applies field edits to selected transactions', () => {
  const days = makeDays();
  const { nextDays, updatedCount } = applyTransactionEdits(days, [
    {
      id: 'a',
      type: 'income',
      amount: 50,
      currency: 'USD',
      description: 'Bonus',
      category: 'salary'
    }
  ]);

  expect(updatedCount).toBe(1);
  expect(nextDays[0].transactions[0]).toMatchObject({
    id: 'a',
    type: 'income',
    amount: 50,
    currency: 'USD',
    description: 'Bonus',
    category: 'salary'
  });
  expect(nextDays[0].transactions[1].description).toBe('Lunch');
});

const emptyMonthDays = (length: number): Day[] =>
  Array.from({ length }, (_, i) => ({ day: i + 1, description: '', transactions: [] }));

test('listMoveTargetMonths unions the viewed month, stored slices and window', () => {
  const monthsByKey: Record<string, MonthSlice> = {
    '2026-01': { days: [], startBalances: {} }
  };
  const listed = listMoveTargetMonths(monthsByKey, 2026, 2, [
    { year: 2026, month: 7, key: '2026-08' }
  ]);
  expect(listed.map((item) => item.key)).toEqual(['2026-01', '2026-03', '2026-08']);
});

test('moveTransactionsToMonth moves a transaction onto another stored month', () => {
  const sourceDays = makeDays();
  const destDays = emptyMonthDays(31);
  destDays[9].transactions = [tx('z', 'Existing')];

  const { nextSourceDays, nextMonthsByKey, movedCount, error } = moveTransactionsToMonth({
    sourceDays,
    sourceYear: 2026,
    sourceMonth: 7,
    monthsByKey: {
      '2026-08': { days: sourceDays, startBalances: { UAH: 1 } },
      '2026-09': { days: destDays, startBalances: { UAH: 2 }, startBalancesManual: true }
    },
    transactionIds: ['a', 'c'],
    targetYear: 2026,
    targetMonth: 8,
    targetDay: 10
  });

  expect(error).toBeUndefined();
  expect(movedCount).toBe(2);
  expect(nextSourceDays[0].transactions.map((item) => item.id)).toEqual(['b']);
  expect(nextSourceDays[1].transactions).toEqual([]);
  expect(nextMonthsByKey['2026-09'].days[9].transactions.map((item) => item.id)).toEqual([
    'z',
    'a',
    'c'
  ]);
  expect(nextMonthsByKey['2026-09'].startBalancesManual).toBe(true);
  const movedDate = new Date(nextMonthsByKey['2026-09'].days[9].transactions[1].date as Date);
  expect(movedDate.getFullYear()).toBe(2026);
  expect(movedDate.getMonth()).toBe(8);
  expect(movedDate.getDate()).toBe(10);
});

test('moveTransactionsToMonth creates a missing destination month slice', () => {
  const sourceDays = makeDays();
  const { nextMonthsByKey, movedCount } = moveTransactionsToMonth({
    sourceDays,
    sourceYear: 2026,
    sourceMonth: 7,
    monthsByKey: {
      '2026-08': { days: sourceDays, startBalances: {} }
    },
    transactionIds: ['b'],
    targetYear: 2026,
    targetMonth: 8,
    targetDay: 1,
    selectedCurrencies: ['UAH']
  });

  expect(movedCount).toBe(1);
  expect(nextMonthsByKey['2026-09'].days[0].transactions.map((item) => item.id)).toEqual(['b']);
  expect(nextMonthsByKey['2026-08'].days[0].transactions.map((item) => item.id)).toEqual(['a']);
});

test('moveTransactionsToMonth same-month path still rearranges days', () => {
  const sourceDays = makeDays();
  const { nextSourceDays, movedCount, error } = moveTransactionsToMonth({
    sourceDays,
    sourceYear: 2026,
    sourceMonth: 7,
    monthsByKey: {
      '2026-08': { days: sourceDays, startBalances: {} }
    },
    transactionIds: ['a'],
    targetYear: 2026,
    targetMonth: 7,
    targetDay: 3
  });

  expect(error).toBeUndefined();
  expect(movedCount).toBe(1);
  expect(nextSourceDays[0].transactions.map((item) => item.id)).toEqual(['b']);
  expect(nextSourceDays[2].transactions.map((item) => item.id)).toEqual(['a']);
});

test('moveTransactionsToMonth rejects a destination over the monthly limit', () => {
  const sourceDays = makeDays();
  const destDays = emptyMonthDays(31);
  destDays[0].transactions = Array.from({ length: MAX_TRANSACTIONS_PER_MONTH }, (_, i) =>
    tx(`full-${i}`, 'Filled')
  );

  const result = moveTransactionsToMonth({
    sourceDays,
    sourceYear: 2026,
    sourceMonth: 7,
    monthsByKey: {
      '2026-08': { days: sourceDays, startBalances: {} },
      '2026-09': { days: destDays, startBalances: {} }
    },
    transactionIds: ['a'],
    targetYear: 2026,
    targetMonth: 8,
    targetDay: 2
  });

  expect(result.error).toBe('month-limit');
  expect(result.movedCount).toBe(0);
  expect(result.nextSourceDays).toBe(sourceDays);
  expect(result.limitExisting).toBe(MAX_TRANSACTIONS_PER_MONTH);
  expect(result.limitAdding).toBe(1);
});

test('moveTransactionsToMonth rejects a target that would drop another month with data', () => {
  const monthsByKey: Record<string, MonthSlice> = {};
  for (let i = 0; i < MAX_STORED_MONTHS; i += 1) {
    const { year, month } = shiftMonths(2025, 0, i);
    const key = formatMonthKey(year, month);
    const days = emptyMonthDays(31);
    days[0].transactions = [tx(`${key}-keep`, 'Keep'), tx(`${key}-extra`, 'Extra')];
    monthsByKey[key] = { days, startBalances: {} };
  }

  const sourceDays = monthsByKey['2025-01'].days;
  const result = moveTransactionsToMonth({
    sourceDays,
    sourceYear: 2025,
    sourceMonth: 0,
    monthsByKey,
    transactionIds: ['2025-01-keep'],
    targetYear: 2026,
    targetMonth: 0,
    targetDay: 1
  });

  expect(result.error).toBe('would-drop-data');
  expect(result.movedCount).toBe(0);
  expect(result.nextSourceDays).toBe(sourceDays);
});
