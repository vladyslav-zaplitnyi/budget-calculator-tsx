import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '../i18n/config';
import ExportPdfReportModal from './ExportPdfReportModal';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import type { Day, MonthSlice, Transaction } from '../types';

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null
  });
});

const tx = (id: string, extra?: Partial<Transaction>): Transaction => ({
  id,
  type: 'expense',
  amount: 120,
  currency: 'UAH',
  description: 'Groceries',
  category: 'groceries',
  ...extra
});

const withTx = (days: Day[], day: number, transaction: Transaction): Day[] =>
  days.map((item) =>
    item.day === day
      ? { ...item, transactions: [...item.transactions, transaction] }
      : item
  );

test('PDF export modal lets the user pick months and requires at least one', () => {
  const [first] = getDefaultOverviewWindow();
  const days = withTx(createEmptyMonthDays(first.year, first.month), 4, tx('g1'));
  const monthsByKey: Record<string, MonthSlice> = {
    [first.key]: { days, startBalances: { UAH: 500 } }
  };

  render(
    <ExportPdfReportModal
      isOpen
      onClose={jest.fn()}
      monthsByKey={monthsByKey}
      activeMonthKey={first.key}
      activeDays={days}
      activeStartBalances={{ UAH: 500 }}
      selectedCurrencies={['UAH']}
      displayCurrency="UAH"
      exchangeRates={{}}
      budgetName="Test budget"
    />
  );

  expect(screen.getByRole('heading', { name: /pdf/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /завантажити pdf/i })).not.toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: /очистити/i }));
  expect(screen.getByText(/оберіть хоча б один місяць/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /завантажити pdf/i })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: /з даними/i }));
  expect(screen.getByRole('button', { name: /завантажити pdf/i })).not.toBeDisabled();
});
