import { Day, Transaction } from '../types';
import { moveTransactionsToDay } from './moveTransactions';

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
