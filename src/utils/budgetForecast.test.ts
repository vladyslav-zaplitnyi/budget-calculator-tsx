import {
  buildForecastCandidates,
  buildForecastFingerprint,
  validateForecastCopy,
  applyForecastCopy
} from './budgetForecast';
import type { Day, MonthSlice } from '../types';

function makeTx(
  id: string,
  type: 'income' | 'expense',
  amount: number,
  currency: string,
  description: string
) {
  return { id, type, amount, currency, description };
}

function makeDays(txsByDay: Record<number, ReturnType<typeof makeTx>[]>): Day[] {
  const days: Day[] = [];
  for (let d = 1; d <= 31; d++) {
    days.push({ day: d, transactions: txsByDay[d] || [], description: '' });
  }
  return days;
}

describe('budgetForecast', () => {
  const monthsByKey: Record<string, MonthSlice> = {
    '2026-01': {
      days: makeDays({
        5: [makeTx('a', 'expense', 500, 'UAH', 'Оренда')],
        10: [makeTx('b', 'expense', 200, 'UAH', 'Інтернет')],
        15: [makeTx('e', 'expense', 50, 'UAH', 'Кава')],
        20: [makeTx('f', 'expense', 60, 'UAH', 'Кава')]
      }),
      startBalances: {}
    },
    '2026-02': {
      days: makeDays({
        5: [makeTx('c', 'expense', 500, 'UAH', 'Оренда')],
        12: [makeTx('d', 'income', 1000, 'UAH', 'Зарплата')]
      }),
      startBalances: {}
    }
  };

  it('groups recurring vs unique by fingerprint across months', () => {
    const { recurring, unique } = buildForecastCandidates(monthsByKey, null, undefined);
    expect(recurring).toHaveLength(1);
    expect(recurring[0].description).toBe('Оренда');
    expect(recurring[0].day).toBe(5);
    expect(recurring[0].monthKeys).toEqual(['2026-01', '2026-02']);
    // Інтернет, Зарплата, and two separate «Кава» (different days)
    expect(unique).toHaveLength(4);
    const coffee = unique.filter((u) => u.description === 'Кава');
    expect(coffee).toHaveLength(2);
    expect(coffee.map((c) => c.day).sort((a, b) => a - b)).toEqual([15, 20]);
  });

  it('treats same name on different days as separate unique patterns', () => {
    const { unique } = buildForecastCandidates(monthsByKey, null, undefined);
    const coffeeDays = unique.filter((u) => u.description === 'Кава').map((u) => u.day);
    expect(coffeeDays).toContain(15);
    expect(coffeeDays).toContain(20);
    expect(unique.every((u) => u.isRecurring === false)).toBe(true);
  });

  it('skips months that already have the same pattern on the same day', () => {
    const draft = {
      monthKeys: ['2026-02', '2026-03'],
      items: [
        {
          fingerprint: buildForecastFingerprint('expense', 'UAH', 'Оренда', 5),
          type: 'expense' as const,
          amount: 500,
          currency: 'UAH',
          description: 'Оренда',
          day: 5
        }
      ]
    };
    const validation = validateForecastCopy(draft, monthsByKey, null, undefined);
    expect(validation.ok).toBe(true);
    expect(validation.createCount).toBe(1);
    const skipped = validation.plan.filter((p) => p.skippedExisting);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].monthKey).toBe('2026-02');
  });

  it('does not skip when same name exists on a different day', () => {
    const draft = {
      monthKeys: ['2026-01'],
      items: [
        {
          fingerprint: buildForecastFingerprint('expense', 'UAH', 'Кава', 3),
          type: 'expense' as const,
          amount: 40,
          currency: 'UAH',
          description: 'Кава',
          day: 3
        }
      ]
    };
    const validation = validateForecastCopy(draft, monthsByKey, null, undefined);
    expect(validation.createCount).toBe(1);
    expect(validation.plan.every((p) => !p.skippedExisting)).toBe(true);
  });

  it('applies copy into empty months', () => {
    const draft = {
      monthKeys: ['2026-03'],
      items: [
        {
          fingerprint: buildForecastFingerprint('expense', 'UAH', 'Оренда', 5),
          type: 'expense' as const,
          amount: 520,
          currency: 'UAH',
          description: 'Оренда',
          day: 5
        }
      ]
    };
    const validation = validateForecastCopy(draft, monthsByKey, null, undefined);
    const result = applyForecastCopy(
      validation.plan,
      monthsByKey,
      null,
      undefined,
      ['UAH']
    );
    expect(result.addedCount).toBe(1);
    const day5 = result.monthsByKey['2026-03'].days[4];
    expect(day5.transactions).toHaveLength(1);
    expect(day5.transactions[0].amount).toBe(520);
    expect(day5.transactions[0].description).toBe('Оренда');
  });
});
