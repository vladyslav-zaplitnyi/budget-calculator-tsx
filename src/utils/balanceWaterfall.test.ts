import type { Budget, Day } from '../types';
import { createEmptyMonthDays } from './dayHelpers';
import {
  applyBalanceWaterfallToBudget,
  applyRollingBootToAllBudgets
} from './balanceWaterfall';
import {
  applyBootToCurrentCalendarMonth,
  getSeedMonthKey,
  monthKeyFromBudgetDate,
  trimMonthsReanchorSeed
} from './rollingMonthsBudget';

const AUG = { year: 2026, month: 7 };
const SEP = { year: 2026, month: 8 };
const AUG_KEY = monthKeyFromBudgetDate(AUG.year, AUG.month);
const SEP_KEY = monthKeyFromBudgetDate(SEP.year, SEP.month);

function daysWithExpense(year: number, month: number, amount: number): Day[] {
  const days = createEmptyMonthDays(year, month);
  days[0].transactions.push({
    id: 'e1',
    type: 'expense',
    amount,
    currency: 'UAH',
    description: 'test'
  });
  return days;
}

function augustBudget(overrides: Partial<Budget> = {}): Budget {
  const augustDays = daysWithExpense(AUG.year, AUG.month, 2000);
  return {
    name: 'Test',
    selectedCurrencies: ['UAH'],
    exchangeRates: {},
    startBalances: { UAH: 10000 },
    budgetDate: AUG,
    days: augustDays,
    monthsByKey: {
      [AUG_KEY]: { days: augustDays, startBalances: { UAH: 10000 } }
    },
    ...overrides
  };
}

describe('getSeedMonthKey', () => {
  it('is the first stored month in chronological order', () => {
    expect(
      getSeedMonthKey({
        [SEP_KEY]: { days: [], startBalances: {} },
        [AUG_KEY]: { days: [], startBalances: {} }
      })
    ).toBe(AUG_KEY);
  });
});

describe('applyBalanceWaterfallToBudget', () => {
  it('keeps the seed on August and carries August closing into September', () => {
    const augustDays = daysWithExpense(AUG.year, AUG.month, 2000);
    const budget = augustBudget({
      budgetDate: SEP,
      days: createEmptyMonthDays(SEP.year, SEP.month),
      monthsByKey: {
        [AUG_KEY]: { days: augustDays, startBalances: { UAH: 10000 } },
        [SEP_KEY]: {
          days: createEmptyMonthDays(SEP.year, SEP.month),
          startBalances: { UAH: 10000 }
        }
      }
    });

    const next = applyBalanceWaterfallToBudget(budget);

    expect(next.startBalances.UAH).toBe(10000);
    expect(next.monthsByKey?.[AUG_KEY]?.startBalances.UAH).toBe(10000);
    expect(next.monthsByKey?.[SEP_KEY]?.startBalances.UAH).toBe(8000);
  });

  it('does not treat the current calendar month as the seed month', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1));
    try {
      const next = applyBalanceWaterfallToBudget(
        augustBudget({
          budgetDate: SEP,
          days: createEmptyMonthDays(SEP.year, SEP.month),
          monthsByKey: {
            [AUG_KEY]: {
              days: daysWithExpense(AUG.year, AUG.month, 2000),
              startBalances: { UAH: 10000 }
            },
            [SEP_KEY]: {
              days: createEmptyMonthDays(SEP.year, SEP.month),
              startBalances: { UAH: null }
            }
          }
        })
      );

      expect(next.monthsByKey?.[AUG_KEY]?.startBalances.UAH).toBe(10000);
      expect(next.monthsByKey?.[SEP_KEY]?.startBalances.UAH).toBe(8000);
      expect(next.startBalances.UAH).toBe(10000);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('applyBootToCurrentCalendarMonth', () => {
  it('keeps the original seed and does not copy it onto September', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1));
    try {
      const booted = applyBootToCurrentCalendarMonth(augustBudget());

      expect(booted.budgetDate).toEqual(SEP);
      expect(booted.startBalances.UAH).toBe(10000);
      expect(booted.monthsByKey?.[AUG_KEY]?.startBalances.UAH).toBe(10000);
      expect(booted.monthsByKey?.[SEP_KEY]).toBeDefined();
      expect(booted.monthsByKey?.[SEP_KEY]?.startBalances.UAH).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('applyRollingBootToAllBudgets', () => {
  it('waterfalls August closing into September on month rollover', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 1));
    try {
      const rolled = applyRollingBootToAllBudgets({ default: augustBudget() }, 'default');
      const next = rolled.default;

      expect(next?.budgetDate).toEqual(SEP);
      expect(next?.startBalances.UAH).toBe(10000);
      expect(next?.monthsByKey?.[AUG_KEY]?.startBalances.UAH).toBe(10000);
      expect(next?.monthsByKey?.[SEP_KEY]?.startBalances.UAH).toBe(8000);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('trimMonthsReanchorSeed', () => {
  it('moves the seed to the new first month when the oldest month is dropped', () => {
    const monthsByKey: Record<string, { days: Day[]; startBalances: Record<string, number | null> }> =
      {};
    for (let i = 0; i < 12; i++) {
      const month = i;
      const key = monthKeyFromBudgetDate(2026, month);
      monthsByKey[key] = {
        days: createEmptyMonthDays(2026, month),
        startBalances: { UAH: 100 + i }
      };
    }
    monthsByKey[monthKeyFromBudgetDate(2027, 0)] = {
      days: createEmptyMonthDays(2027, 0),
      startBalances: { UAH: 999 }
    };

    const { monthsByKey: trimmed, startBalances } = trimMonthsReanchorSeed(
      monthsByKey,
      { UAH: 100 },
      12,
      false
    );

    expect(Object.keys(trimmed).sort()[0]).toBe(monthKeyFromBudgetDate(2026, 1));
    expect(trimmed[monthKeyFromBudgetDate(2026, 0)]).toBeUndefined();
    expect(startBalances.UAH).toBe(101);
  });
});
