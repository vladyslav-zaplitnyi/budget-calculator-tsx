import { Day, MonthSlice, Transaction } from '../types';
import { OverviewTransaction } from './budgetInsights';
import { UNNAMED_DESCRIPTION_KEY } from './expenseDescriptionBreakdown';
import {
  applyTransactionEditsAcrossMonths,
  collectTransactionsAcrossMonths,
  deleteTransactionsByIdsAcrossMonths,
  groupOverviewTransactionsByDescription
} from './multiMonthTransactionEdits';

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

const overviewTx = (
  id: string,
  description: string,
  year: number,
  month: number,
  day: number,
  extra?: Partial<OverviewTransaction>
): OverviewTransaction => ({
  ...tx(id, description, extra),
  day,
  dayIndex: day - 1,
  convertedAmount: extra?.convertedAmount ?? extra?.amount ?? 10,
  year,
  month,
  monthKey: `${year}-${String(month + 1).padStart(2, '0')}`
});

const emptyDays = (length: number): Day[] =>
  Array.from({ length }, (_, i) => ({ day: i + 1, description: '', transactions: [] }));

const withTx = (days: Day[], day: number, transaction: Transaction): Day[] =>
  days.map((item) =>
    item.day === day
      ? { ...item, transactions: [...item.transactions, transaction] }
      : item
  );

test('groups the same description across months, ignoring case and extra spaces', () => {
  const groups = groupOverviewTransactionsByDescription([
    overviewTx('a', 'Netflix', 2026, 0, 5),
    overviewTx('b', '  netflix ', 2026, 1, 5, { amount: 15, convertedAmount: 15 }),
    overviewTx('c', 'Rent', 2026, 0, 1, { amount: 100, convertedAmount: 100 })
  ]);

  expect(groups).toHaveLength(2);
  expect(groups[0].key).toBe('netflix');
  expect(groups[0].name).toBe('Netflix');
  expect(groups[0].transactions.map((item) => item.id)).toEqual(['a', 'b']);
  expect(groups[0].expense).toBe(25);
  expect(groups[1].name).toBe('Rent');
});

test('puts unnamed descriptions in one group and sorts repeats first', () => {
  const groups = groupOverviewTransactionsByDescription([
    overviewTx('a', '   ', 2026, 0, 1),
    overviewTx('b', '', 2026, 1, 2),
    overviewTx('c', 'Coffee', 2026, 0, 3)
  ]);

  expect(groups[0].key).toBe(UNNAMED_DESCRIPTION_KEY);
  expect(groups[0].transactions.map((item) => item.id)).toEqual(['a', 'b']);
  expect(groups[1].name).toBe('Coffee');
});

test('collects selected transactions from several months and prefers live active days', () => {
  const january = withTx(emptyDays(31), 3, tx('jan', 'Rent', { amount: 100 }));
  const februaryStored = withTx(emptyDays(28), 1, tx('feb-old', 'Stale', { amount: 1 }));
  const februaryLive = withTx(emptyDays(28), 8, tx('feb', 'Salary', { type: 'income', amount: 50 }));

  const collected = collectTransactionsAcrossMonths(
    {
      '2026-01': { days: january, startBalances: {} },
      '2026-02': { days: februaryStored, startBalances: {} }
    },
    ['feb', 'jan'],
    '2026-02',
    februaryLive
  );

  expect(collected.map((item) => item.transaction.id)).toEqual(['feb', 'jan']);
  expect(collected[0]).toMatchObject({ day: 8, monthKey: '2026-02', year: 2026, month: 1 });
  expect(collected[1]).toMatchObject({ day: 3, monthKey: '2026-01', year: 2026, month: 0 });
});

test('applies edits across months and mirrors the active month days', () => {
  const january = withTx(emptyDays(31), 3, tx('jan', 'Rent', { amount: 100, category: 'utilities' }));
  const february = withTx(emptyDays(28), 8, tx('feb', 'Rent', { amount: 100, category: 'utilities' }));
  const monthsByKey: Record<string, MonthSlice> = {
    '2026-01': { days: january, startBalances: { UAH: 10 } },
    '2026-02': { days: february, startBalances: { UAH: 20 } }
  };

  const { nextMonthsByKey, nextActiveDays, updatedCount } = applyTransactionEditsAcrossMonths({
    monthsByKey,
    patches: [
      {
        id: 'jan',
        type: 'expense',
        amount: 120,
        currency: 'UAH',
        description: 'Rent updated',
        category: 'utilities'
      },
      {
        id: 'feb',
        type: 'expense',
        amount: 120,
        currency: 'UAH',
        description: 'Rent updated',
        category: 'utilities'
      }
    ],
    activeMonthKey: '2026-02',
    activeDays: february
  });

  expect(updatedCount).toBe(2);
  expect(nextMonthsByKey['2026-01'].days[2].transactions[0]).toMatchObject({
    amount: 120,
    description: 'Rent updated'
  });
  expect(nextActiveDays?.[7].transactions[0]).toMatchObject({
    amount: 120,
    description: 'Rent updated'
  });
  expect(nextMonthsByKey['2026-02'].days[7].transactions[0].amount).toBe(120);
  expect(january[2].transactions[0].amount).toBe(100);
  expect(february[7].transactions[0].amount).toBe(100);
});

test('deletes selected transactions across months without touching others', () => {
  const january = withTx(
    withTx(emptyDays(31), 3, tx('jan', 'Rent')),
    4,
    tx('keep', 'Coffee')
  );
  const february = withTx(emptyDays(28), 8, tx('feb', 'Rent'));

  const { nextMonthsByKey, nextActiveDays, deletedCount } = deleteTransactionsByIdsAcrossMonths({
    monthsByKey: {
      '2026-01': { days: january, startBalances: {} },
      '2026-02': { days: february, startBalances: {} }
    },
    transactionIds: ['jan', 'feb'],
    activeMonthKey: '2026-01',
    activeDays: january
  });

  expect(deletedCount).toBe(2);
  expect(nextActiveDays?.[2].transactions).toEqual([]);
  expect(nextActiveDays?.[3].transactions.map((item) => item.id)).toEqual(['keep']);
  expect(nextMonthsByKey['2026-02'].days[7].transactions).toEqual([]);
  expect(january[2].transactions).toHaveLength(1);
});
