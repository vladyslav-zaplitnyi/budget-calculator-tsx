import { createEmptyMonthDays } from './dayHelpers';
import {
  deleteMonthKeysAndReanchorSeed,
  getOverviewWindowForMonths
} from './rollingMonthsBudget';
import type { MonthSlice } from '../types';

const monthSlice = (year: number, month: number, withTransaction = false): MonthSlice => {
  const days = createEmptyMonthDays(year, month);
  if (withTransaction) {
    days[0] = {
      ...days[0],
      transactions: [
        { id: `${year}-${month}`, type: 'expense', amount: 10, currency: 'UAH', description: '' }
      ]
    };
  }
  return { days, startBalances: { UAH: 0 } };
};

test('overview window starts at the first month with transactions', () => {
  const monthsByKey = {
    '2025-12': monthSlice(2025, 11, true),
    '2026-01': monthSlice(2026, 0),
    '2026-11': monthSlice(2026, 10, true)
  };

  const window = getOverviewWindowForMonths(monthsByKey, '2026-11');

  expect(window).toHaveLength(12);
  expect(window[0].key).toBe('2025-12');
  expect(window[11].key).toBe('2026-11');
});

test('overview window shifts to keep the newest transaction month visible', () => {
  const monthsByKey = {
    '2025-01': monthSlice(2025, 0, true),
    '2026-11': monthSlice(2026, 10, true)
  };

  const window = getOverviewWindowForMonths(monthsByKey);

  expect(window).toHaveLength(12);
  expect(window[0].key).toBe('2025-12');
  expect(window[window.length - 1].key).toBe('2026-11');
});

test('deleting the first month re-anchors the seed balances on the next month', () => {
  const monthsByKey = {
    '2026-01': { ...monthSlice(2026, 0, true), startBalances: { UAH: 100 } },
    '2026-02': { ...monthSlice(2026, 1), startBalances: { UAH: 250 } }
  };

  const result = deleteMonthKeysAndReanchorSeed(monthsByKey, { UAH: 100 }, ['2026-01']);

  expect(Object.keys(result.monthsByKey)).toEqual(['2026-02']);
  expect(result.startBalances).toEqual({ UAH: 250 });
});

test('deleting later months keeps the existing seed balances', () => {
  const monthsByKey = {
    '2026-01': { ...monthSlice(2026, 0), startBalances: { UAH: 100 } },
    '2026-02': { ...monthSlice(2026, 1), startBalances: { UAH: 200 } },
    '2026-03': { ...monthSlice(2026, 2), startBalances: { UAH: 300 } }
  };

  const result = deleteMonthKeysAndReanchorSeed(monthsByKey, { UAH: 100 }, ['2026-02', '2026-03']);

  expect(Object.keys(result.monthsByKey)).toEqual(['2026-01']);
  expect(result.startBalances).toEqual({ UAH: 100 });
});
