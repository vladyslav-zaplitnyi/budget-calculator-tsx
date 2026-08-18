import { Day } from '../types';
import {
  applyMultiMonthBulkAdd,
  validateMultiMonthBulkAdd
} from './multiMonthBulkTransactions';

const emptyDays = (): Day[] =>
  Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    description: '',
    transactions: []
  }));

test('applyMultiMonthBulkAdd keeps the selected category on every new transaction', () => {
  const activeDays = emptyDays();
  const validation = validateMultiMonthBulkAdd(
    ['2026-08', '2026-09'],
    [15],
    {},
    '2026-08',
    activeDays
  );
  expect(validation.ok).toBe(true);

  const result = applyMultiMonthBulkAdd(
    validation.plan,
    {
      type: 'income',
      amount: 1000,
      currency: 'USD',
      description: 'ЗП',
      category: 'salary'
    },
    {},
    '2026-08',
    activeDays,
    ['USD']
  );

  const augustTx = result.activeMonthDays?.[14].transactions?.[0];
  const septemberTx = result.monthsByKey['2026-09'].days[14].transactions[0];

  expect(augustTx?.category).toBe('salary');
  expect(augustTx?.description).toBe('ЗП');
  expect(septemberTx.category).toBe('salary');
  expect(septemberTx.description).toBe('ЗП');
});

test('applyMultiMonthBulkAdd omits category when none was selected', () => {
  const activeDays = emptyDays();
  const validation = validateMultiMonthBulkAdd(['2026-08'], [1], {}, '2026-08', activeDays);
  expect(validation.ok).toBe(true);

  const result = applyMultiMonthBulkAdd(
    validation.plan,
    {
      type: 'expense',
      amount: 10,
      currency: 'UAH',
      description: 'Кава'
    },
    {},
    '2026-08',
    activeDays,
    ['UAH']
  );

  expect(result.activeMonthDays?.[0].transactions?.[0].category).toBeUndefined();
});
