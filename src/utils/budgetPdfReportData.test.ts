import { createEmptyMonthDays } from './dayHelpers';
import type { Day, MonthSlice, Transaction } from '../types';
import {
  areMonthKeysContiguous,
  buildPdfExportFileName,
  buildPdfReportData,
  defaultSelectedPdfMonthKeys,
  listPdfExportableMonths,
  monthChartLabel
} from './budgetPdfReportData';

const tx = (partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount'>): Transaction => ({
  currency: 'UAH',
  description: partial.description || partial.id,
  ...partial
});

const withTx = (days: Day[], day: number, transaction: Transaction): Day[] =>
  days.map((item) =>
    item.day === day
      ? { ...item, transactions: [...item.transactions, transaction] }
      : item
  );

const jan = { key: '2026-01', year: 2026, month: 0 };
const feb = { key: '2026-02', year: 2026, month: 1 };
const mar = { key: '2026-03', year: 2026, month: 2 };
const windowMonths = [jan, feb, mar];

const makeSlice = (
  year: number,
  month: number,
  transactions: Array<{ day: number; tx: Transaction }>,
  startBalances: Record<string, number | null> = { UAH: 1000 }
): MonthSlice => {
  let days = createEmptyMonthDays(year, month);
  transactions.forEach(({ day, tx: transaction }) => {
    days = withTx(days, day, transaction);
  });
  return { days, startBalances };
};

test('listPdfExportableMonths unions stored keys with the overview window', () => {
  const monthsByKey = {
    '2025-11': makeSlice(2025, 10, [])
  };
  const listed = listPdfExportableMonths(
    { monthsByKey, activeMonthKey: '2026-01' },
    windowMonths
  );
  expect(listed.map((month) => month.key)).toEqual([
    '2025-11',
    '2026-01',
    '2026-02',
    '2026-03'
  ]);
});

test('defaultSelectedPdfMonthKeys prefers months that have transactions', () => {
  const janDays = withTx(
    createEmptyMonthDays(2026, 0),
    3,
    tx({ id: 'e1', type: 'expense', amount: 50 })
  );
  const context = {
    monthsByKey: {
      '2026-01': { days: janDays, startBalances: {} },
      '2026-02': { days: createEmptyMonthDays(2026, 1), startBalances: {} }
    },
    activeMonthKey: '2026-02',
    activeDays: createEmptyMonthDays(2026, 1)
  };
  expect(defaultSelectedPdfMonthKeys(windowMonths, context)).toEqual(['2026-01']);
});

test('buildPdfReportData aggregates selected months in the display currency', () => {
  const monthsByKey = {
    '2026-01': makeSlice(2026, 0, [
      { day: 1, tx: tx({ id: 'sal', type: 'income', amount: 2000, description: 'Salary', category: 'salary' }) },
      { day: 5, tx: tx({ id: 'food', type: 'expense', amount: 400, description: 'Food', category: 'groceries' }) }
    ]),
    '2026-02': makeSlice(2026, 1, [
      { day: 2, tx: tx({ id: 'coffee', type: 'expense', amount: 20, currency: 'USD', description: 'Coffee', category: 'cafe' }) }
    ], { UAH: 2600 })
  };

  const report = buildPdfReportData({
    monthKeys: ['2026-02', '2026-01'],
    availableMonths: windowMonths,
    monthsByKey,
    selectedCurrencies: ['UAH', 'USD'],
    displayCurrency: 'UAH',
    exchangeRates: { UAH_USD: { buy: 40, sell: 40 } },
    budgetName: 'Family',
    locale: 'en',
    today: new Date(2026, 7, 27)
  });

  expect(report.months.map((month) => month.key)).toEqual(['2026-01', '2026-02']);
  expect(report.totals.income).toBe(2000);
  expect(report.totals.expense).toBe(1200);
  expect(report.totals.net).toBe(800);
  expect(report.totals.transactionCount).toBe(3);
  expect(report.totals.monthCount).toBe(2);
  expect(report.periodContiguous).toBe(true);
  expect(report.categories[0].id).toBe('cafe');
  expect(report.topExpenses[0].description).toBe('Coffee');
  expect(report.insights.some((insight) => insight.id === 'netPositive')).toBe(true);
  expect(report.insights.some((insight) => insight.id === 'topCategory' && insight.categoryId === 'cafe')).toBe(true);
});

test('areMonthKeysContiguous detects gaps', () => {
  expect(areMonthKeysContiguous(['2026-01', '2026-02', '2026-03'])).toBe(true);
  expect(areMonthKeysContiguous(['2026-01', '2026-03'])).toBe(false);
});

test('buildPdfExportFileName includes budget name and month range', () => {
  const report = buildPdfReportData({
    monthKeys: ['2026-01', '2026-03'],
    availableMonths: windowMonths,
    monthsByKey: {},
    selectedCurrencies: ['UAH'],
    displayCurrency: 'UAH',
    exchangeRates: {},
    budgetName: 'My Budget',
    locale: 'uk',
    today: new Date(2026, 7, 27)
  });
  expect(buildPdfExportFileName(report.budgetName, report.months, report.generatedAt)).toBe(
    'budget_My_Budget_report_2026-01_2026-03_2026-08-27.pdf'
  );
});

test('monthChartLabel adds a short year when the range spans years', () => {
  expect(monthChartLabel('en', 2026, 0, false)).toMatch(/jan/i);
  expect(monthChartLabel('en', 2026, 0, true)).toMatch(/26/);
});
