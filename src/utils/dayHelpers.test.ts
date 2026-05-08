import { normalizeDaysArray } from './dayHelpers';
import { Day } from '../types';

test('normalizeDaysArray preserves transactions for 30-day budgets', () => {
  const sourceDays: Day[] = Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    transactions: [],
    description: ''
  }));

  sourceDays[29].transactions.push({
    id: 'tx-30',
    type: 'expense',
    amount: 25,
    currency: 'UAH',
    description: 'Last day transaction'
  });

  const normalizedDays = normalizeDaysArray(sourceDays, 2026, 3);

  expect(normalizedDays).toHaveLength(30);
  expect(normalizedDays[29].transactions).toHaveLength(1);
  expect(normalizedDays[29].transactions[0].id).toBe('tx-30');
});
