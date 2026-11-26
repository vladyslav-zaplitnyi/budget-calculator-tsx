import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n/config';
import MonthLimitModal from './MonthLimitModal';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import type { MonthSlice } from '../types';

const slice = (year: number, monthIndex: number, transactionCount = 0): MonthSlice => {
  const days = createEmptyMonthDays(year, monthIndex);
  if (transactionCount > 0) {
    days[0] = {
      ...days[0],
      transactions: Array.from({ length: transactionCount }, (_, index) => ({
        id: `${year}-${monthIndex}-${index}`,
        type: 'expense' as const,
        amount: 10,
        currency: 'UAH',
        description: ''
      }))
    };
  }
  return { days, startBalances: { UAH: 0 } };
};

const monthsByKey: Record<string, MonthSlice> = {
  '2026-01': slice(2026, 0, 2),
  '2026-02': slice(2026, 1, 1),
  '2026-03': slice(2026, 2)
};

const renderModal = (
  props: Partial<React.ComponentProps<typeof MonthLimitModal>> = {}
) => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  render(
    <MonthLimitModal
      isOpen
      target={{ year: 2026, month: 3 }}
      activeMonthKey="2026-03"
      direction="forward"
      monthsByKey={monthsByKey}
      requiredCount={1}
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />
  );
  return { onConfirm, onClose };
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('defaults to the first month and confirms its key', () => {
  const { onConfirm } = renderModal();

  fireEvent.click(screen.getByText('Delete and open'));

  expect(onConfirm).toHaveBeenCalledWith(['2026-01']);
});

test('keeps the selected range consecutive and blocks an insufficient range', () => {
  const { onConfirm } = renderModal({ requiredCount: 2 });

  const confirmButton = screen.getByText('Delete and open');
  expect(confirmButton).toBeEnabled();

  fireEvent.click(screen.getByText('Delete the first month'));
  expect(confirmButton).toBeDisabled();

  fireEvent.click(confirmButton);
  expect(onConfirm).not.toHaveBeenCalled();
});
