import {
  calculateBudgetInsights,
  calculateTwelveMonthBudgetInsights,
  filterMonthlyTransactions,
  flattenMonthlyTransactions,
  getFilledOverviewMonths,
  overviewMonthHasTransactions
} from './budgetInsights';
import { Day } from '../types';
import { getDefaultOverviewWindow } from './rollingMonthsBudget';

const createDays = (): Day[] => {
  const days: Day[] = Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    transactions: [],
    description: ''
  }));

  days[0].transactions = [
    {
      id: 'income-1',
      type: 'income',
      amount: 1000,
      currency: 'UAH',
      description: 'Salary'
    },
    {
      id: 'expense-1',
      type: 'expense',
      amount: 120,
      currency: 'UAH',
      description: 'Groceries'
    }
  ];

  days[1].transactions = [
    {
      id: 'expense-2',
      type: 'expense',
      amount: 10,
      currency: 'USD',
      description: 'Coffee'
    }
  ];

  days[30].transactions = [
    {
      id: 'outside-february',
      type: 'expense',
      amount: 999,
      currency: 'UAH',
      description: 'Hidden in February'
    }
  ];

  return days;
};

test('flattenMonthlyTransactions only includes real days for the budget month', () => {
  const transactions = flattenMonthlyTransactions({
    days: createDays(),
    displayCurrency: 'UAH',
    exchangeRates: {
      UAH_USD: { buy: 40, sell: 41 }
    },
    budgetYear: 2026,
    budgetMonth: 1
  });

  expect(transactions.map(transaction => transaction.id)).toEqual([
    'income-1',
    'expense-1',
    'expense-2'
  ]);
  expect(transactions[2].convertedAmount).toBe(410);
});

test('calculateBudgetInsights summarizes cash flow and monthly pacing', () => {
  const insights = calculateBudgetInsights({
    days: createDays(),
    selectedCurrencies: ['UAH', 'USD'],
    displayCurrency: 'UAH',
    exchangeRates: {
      UAH_USD: { buy: 40, sell: 41 }
    },
    startBalances: {
      UAH: 500,
      USD: 5
    },
    budgetYear: 2026,
    budgetMonth: 1,
    today: new Date(2026, 1, 10)
  });

  expect(insights.daysInMonth).toBe(28);
  expect(insights.elapsedDays).toBe(10);
  expect(insights.totalIncome).toBe(1000);
  expect(insights.totalExpense).toBe(530);
  expect(insights.netCashFlow).toBe(470);
  expect(insights.totalStartBalance).toBe(705);
  expect(insights.noSpendDays).toBe(8);
  expect(insights.topExpenses[0].id).toBe('expense-2');
  expect(insights.projectedExpense).toBeCloseTo(1484);
});

test('filterMonthlyTransactions supports text, type, currency and day filters', () => {
  const transactions = flattenMonthlyTransactions({
    days: createDays(),
    displayCurrency: 'UAH',
    exchangeRates: {
      UAH_USD: { buy: 40, sell: 41 }
    },
    budgetYear: 2026,
    budgetMonth: 1
  });

  const filtered = filterMonthlyTransactions(transactions, {
    search: 'coffee',
    type: 'expense',
    currency: 'USD',
    day: 2
  });

  expect(filtered).toHaveLength(1);
  expect(filtered[0].id).toBe('expense-2');
});

test('getFilledOverviewMonths skips months without transactions', () => {
  const emptyDays: Day[] = Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    transactions: [],
    description: ''
  }));
  const filledDays = createDays();
  const monthsByKey = {
    '2026-01': { days: filledDays, startBalances: { UAH: 100 } },
    '2026-02': { days: emptyDays, startBalances: { UAH: 200 } }
  };

  const windowMonths = [
    { year: 2026, month: 0, key: '2026-01' },
    { year: 2026, month: 1, key: '2026-02' },
    { year: 2026, month: 2, key: '2026-03' }
  ];

  expect(
    overviewMonthHasTransactions(windowMonths[0], { monthsByKey })
  ).toBe(true);
  expect(
    overviewMonthHasTransactions(windowMonths[1], { monthsByKey })
  ).toBe(false);
  expect(
    overviewMonthHasTransactions(windowMonths[2], { monthsByKey })
  ).toBe(false);

  expect(
    getFilledOverviewMonths({ monthsByKey }, windowMonths).map((month) => month.key)
  ).toEqual(['2026-01']);
});

test('calculateTwelveMonthBudgetInsights ignores empty trailing months for projected balance', () => {
  const windowMonths = getDefaultOverviewWindow();
  const filledMonth = windowMonths[0];
  const emptyMonth = windowMonths[windowMonths.length - 1];
  const filledDays = createDays();

  const insights = calculateTwelveMonthBudgetInsights({
    monthsByKey: {
      [filledMonth.key]: { days: filledDays, startBalances: { UAH: 500, USD: 5 } }
    },
    selectedCurrencies: ['UAH', 'USD'],
    displayCurrency: 'UAH',
    exchangeRates: {
      UAH_USD: { buy: 40, sell: 41 }
    },
    startBalances: {
      UAH: 500,
      USD: 5
    },
    activeMonthKey: emptyMonth.key,
    activeDays: createDays().map((day) => ({ ...day, transactions: [] })),
    activeStartBalances: { UAH: 500, USD: 5 },
    today: new Date(filledMonth.year, filledMonth.month, 10)
  });

  expect(insights.totalIncome).toBe(1000);
  expect(insights.projectedEndBalance).toBeGreaterThan(0);
});
