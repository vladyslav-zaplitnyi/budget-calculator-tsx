import {
  calculateBudgetInsights,
  filterMonthlyTransactions,
  flattenMonthlyTransactions
} from './budgetInsights';
import { Day } from '../types';

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
