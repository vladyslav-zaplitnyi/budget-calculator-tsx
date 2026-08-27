import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '../i18n/config';
import MultiMonthTransactionExplorer from './MultiMonthTransactionExplorer';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { formatBudgetTransactionDate } from '../utils/dateHelpers';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import type { Day, MonthSlice, Transaction } from '../types';
import type { TransactionEditPatch } from '../utils/moveTransactions';

const tx = (
  id: string,
  description: string,
  extra?: Partial<Transaction>
): Transaction => ({
  id,
  type: 'expense',
  amount: 10,
  currency: 'UAH',
  description,
  ...extra
});

const withTx = (days: Day[], day: number, transaction: Transaction): Day[] =>
  days.map((item) =>
    item.day === day
      ? { ...item, transactions: [...item.transactions, transaction] }
      : item
  );

const renderExplorer = (
  monthsByKey: Record<string, MonthSlice>,
  extra?: Partial<React.ComponentProps<typeof MultiMonthTransactionExplorer>>
) =>
  render(
    <MultiMonthTransactionExplorer
      monthsByKey={monthsByKey}
      selectedCurrencies={['UAH']}
      displayCurrency="UAH"
      exchangeRates={{}}
      onEditTransactions={jest.fn()}
      onDeleteTransactions={jest.fn()}
      {...extra}
    />
  );

test('description groups start collapsed and toggle from the header', () => {
  const [first, second] = getDefaultOverviewWindow();
  const firstDays = withTx(
    createEmptyMonthDays(first.year, first.month),
    5,
    tx('n1', 'Netflix', { amount: 199 })
  );
  const secondDays = withTx(
    createEmptyMonthDays(second.year, second.month),
    12,
    tx('n2', 'netflix', { amount: 199 })
  );
  const monthsByKey = {
    [first.key]: { days: firstDays, startBalances: {} },
    [second.key]: { days: secondDays, startBalances: {} }
  };

  renderExplorer(monthsByKey);

  fireEvent.click(screen.getByRole('button', { name: /розгорнути/i }));

  const groupHeader = screen.getByRole('button', { name: /netflix/i, expanded: false });
  expect(groupHeader).toHaveAttribute('aria-expanded', 'false');
  expect(within(groupHeader).getByText(/розгорнути/i)).toBeInTheDocument();

  const date1 = formatBudgetTransactionDate('uk', first.year, first.month, 5);
  const date2 = formatBudgetTransactionDate('uk', second.year, second.month, 12);
  expect(screen.queryByText(date1)).not.toBeInTheDocument();
  expect(screen.queryByText(date2)).not.toBeInTheDocument();

  fireEvent.click(groupHeader);
  expect(groupHeader).toHaveAttribute('aria-expanded', 'true');
  expect(within(groupHeader).getByText(/згорнути/i)).toBeInTheDocument();
  expect(screen.getByText(date1)).toBeInTheDocument();
  expect(screen.getByText(date2)).toBeInTheDocument();

  fireEvent.click(groupHeader);
  expect(groupHeader).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(date1)).not.toBeInTheDocument();
  expect(screen.queryByText(date2)).not.toBeInTheDocument();
});

test('selects a collapsed group and opens bulk edit for every match', () => {
  const [first, second] = getDefaultOverviewWindow();
  const firstDays = withTx(
    createEmptyMonthDays(first.year, first.month),
    3,
    tx('rent-1', 'Оренда', { amount: 8000, category: 'utilities' })
  );
  const secondDays = withTx(
    createEmptyMonthDays(second.year, second.month),
    3,
    tx('rent-2', 'оренда', { amount: 8000, category: 'utilities' })
  );
  const onEditTransactions = jest.fn();
  const monthsByKey = {
    [first.key]: { days: firstDays, startBalances: {} },
    [second.key]: { days: secondDays, startBalances: {} }
  };

  renderExplorer(monthsByKey, {
    activeMonthKey: first.key,
    activeDays: firstDays,
    onEditTransactions
  });

  fireEvent.click(screen.getByRole('button', { name: /розгорнути/i }));
  fireEvent.click(screen.getByRole('button', { name: /обрати всі «оренда»/i }));
  expect(screen.getByText(/обрано: 2/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^редагувати$/i }));
  expect(screen.getByRole('heading', { name: /редагувати транзакції \(2\)/i })).toBeInTheDocument();

  const sharedPanel = screen.getByText(/однакові зміни для всіх/i).closest('.rounded-xl');
  expect(sharedPanel).not.toBeNull();
  fireEvent.change(within(sharedPanel as HTMLElement).getByLabelText(/^опис$/i), {
    target: { value: 'Квартира' }
  });
  fireEvent.click(screen.getByRole('button', { name: /застосувати до всіх обраних/i }));
  fireEvent.click(screen.getByRole('button', { name: /зберегти \(2\)/i }));

  expect(onEditTransactions).toHaveBeenCalledTimes(1);
  const patches = onEditTransactions.mock.calls[0][0] as TransactionEditPatch[];
  expect(patches).toHaveLength(2);
  expect(patches.map((item) => item.id).sort()).toEqual(['rent-1', 'rent-2']);
  expect(patches.every((item) => item.description === 'Квартира')).toBe(true);
  expect(patches.every((item) => item.amount === 8000)).toBe(true);
});
