import {
  computeDailyRunningBalances,
  findLowestBalanceRanges,
  findLowestBalanceRangesAcrossMonths,
  formatDayRange
} from './criticalBalances';
import { Day } from '../types';

const eurDay = (day: number, amount: number, type: 'income' | 'expense' = 'expense'): Day => ({
  day,
  description: '',
  transactions: [
    {
      id: `t-${day}`,
      type,
      amount,
      currency: 'EUR',
      description: 'test'
    }
  ]
});

describe('formatDayRange', () => {
  it('returns a single day as-is', () => {
    expect(formatDayRange(5, 5)).toBe('5');
  });

  it('joins consecutive days with a hyphen', () => {
    expect(formatDayRange(1, 4)).toBe('1-4');
  });
});

describe('findLowestBalanceRanges', () => {
  it('groups consecutive days that share the lowest balance', () => {
    const balances = [55, 55, 55, 55, 200, 200];
    expect(findLowestBalanceRanges(balances)).toEqual([
      { startDay: 1, endDay: 4, balance: 55 }
    ]);
  });

  it('keeps non-consecutive dips as separate ranges', () => {
    const balances = [10, 80, 10, 80, 10];
    expect(findLowestBalanceRanges(balances)).toEqual([
      { startDay: 1, endDay: 1, balance: 10 },
      { startDay: 3, endDay: 3, balance: 10 },
      { startDay: 5, endDay: 5, balance: 10 }
    ]);
  });

  it('returns an empty list when there are no balances', () => {
    expect(findLowestBalanceRanges([])).toEqual([]);
  });

  it('caps the number of ranges', () => {
    const balances = [1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1];
    expect(findLowestBalanceRanges(balances, 3)).toHaveLength(3);
  });
});

describe('findLowestBalanceRangesAcrossMonths', () => {
  it('labels the lowest days inside a month like October 1-4', () => {
    const ranges = findLowestBalanceRangesAcrossMonths([
      {
        key: '2026-09',
        year: 2026,
        month: 8,
        dailyBalances: [120, 120, 120]
      },
      {
        key: '2026-10',
        year: 2026,
        month: 9,
        dailyBalances: [55, 55, 55, 55, 400]
      }
    ]);

    expect(ranges).toEqual([
      {
        key: '2026-10',
        year: 2026,
        month: 9,
        startDay: 1,
        endDay: 4,
        balance: 55
      }
    ]);
  });

  it('does not merge a dip that crosses a month boundary', () => {
    const ranges = findLowestBalanceRangesAcrossMonths([
      {
        key: '2026-09',
        year: 2026,
        month: 8,
        dailyBalances: [80, 55]
      },
      {
        key: '2026-10',
        year: 2026,
        month: 9,
        dailyBalances: [55, 55, 90]
      }
    ]);

    expect(ranges).toEqual([
      { key: '2026-09', year: 2026, month: 8, startDay: 2, endDay: 2, balance: 55 },
      { key: '2026-10', year: 2026, month: 9, startDay: 1, endDay: 2, balance: 55 }
    ]);
  });
});

describe('computeDailyRunningBalances', () => {
  it('holds the same balance on idle days after a dip', () => {
    const days: Day[] = [
      eurDay(1, 45),
      { day: 2, transactions: [], description: '' },
      { day: 3, transactions: [], description: '' },
      { day: 4, transactions: [], description: '' },
      eurDay(5, 400, 'income')
    ];

    const balances = computeDailyRunningBalances(
      days,
      { EUR: 100 },
      5,
      ['EUR'],
      'EUR',
      {}
    );

    expect(balances).toEqual([55, 55, 55, 55, 455]);
    expect(findLowestBalanceRanges(balances)).toEqual([
      { startDay: 1, endDay: 4, balance: 55 }
    ]);
  });
});
