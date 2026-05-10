import { Day, ExchangeRates, Transaction } from '../types';
import {
  calculateDayAmountsFromTransactions,
  convertCurrency
} from './calculations';
import { getDaysInMonth } from './dateHelpers';

export interface MonthlyTransaction extends Transaction {
  day: number;
  dayIndex: number;
  convertedAmount: number;
}

export interface BudgetInsights {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  totalStartBalance: number;
  projectedEndBalance: number;
  projectedExpense: number;
  averageDailyExpense: number;
  remainingDailyBudget: number;
  noSpendDays: number;
  daysWithTransactions: number;
  elapsedDays: number;
  remainingDays: number;
  daysInMonth: number;
  monthProgress: number;
  savingsRate: number;
  topExpenses: MonthlyTransaction[];
  transactions: MonthlyTransaction[];
}

export interface BudgetInsightParams {
  days: Day[];
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  startBalances: Record<string, number | null>;
  budgetYear: number;
  budgetMonth: number;
  today?: Date;
}

export interface TransactionFilters {
  search?: string;
  type?: 'all' | 'income' | 'expense';
  currency?: string;
  day?: number | 'all';
}

export const getVisibleMonthDays = (
  days: Day[],
  budgetYear: number,
  budgetMonth: number
): Day[] => {
  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);
  return (days || []).slice(0, daysInMonth);
};

export const getElapsedDaysInBudgetMonth = (
  budgetYear: number,
  budgetMonth: number,
  daysInMonth: number,
  today: Date = new Date()
): number => {
  const monthStart = new Date(budgetYear, budgetMonth, 1).getTime();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

  if (monthStart < currentMonthStart) return daysInMonth;
  if (monthStart > currentMonthStart) return 0;

  return Math.min(Math.max(today.getDate(), 1), daysInMonth);
};

export const flattenMonthlyTransactions = ({
  days,
  displayCurrency,
  exchangeRates,
  budgetYear,
  budgetMonth
}: Pick<BudgetInsightParams, 'days' | 'displayCurrency' | 'exchangeRates' | 'budgetYear' | 'budgetMonth'>): MonthlyTransaction[] => {
  return getVisibleMonthDays(days, budgetYear, budgetMonth).flatMap((day, dayIndex) => {
    const transactions = Array.isArray(day?.transactions) ? day.transactions : [];

    return transactions.map((transaction) => ({
      ...transaction,
      day: day.day,
      dayIndex,
      convertedAmount: convertCurrency(
        Number(transaction.amount) || 0,
        transaction.currency,
        displayCurrency,
        exchangeRates
      )
    }));
  });
};

export const filterMonthlyTransactions = (
  transactions: MonthlyTransaction[],
  filters: TransactionFilters
): MonthlyTransaction[] => {
  const search = (filters.search || '').trim().toLowerCase();
  const type = filters.type || 'all';
  const currency = filters.currency || 'all';
  const day = filters.day || 'all';

  return transactions.filter((transaction) => {
    if (type !== 'all' && transaction.type !== type) return false;
    if (currency !== 'all' && transaction.currency !== currency) return false;
    if (day !== 'all' && transaction.day !== day) return false;

    if (!search) return true;
    const haystack = [
      transaction.description,
      transaction.currency,
      String(transaction.amount),
      String(transaction.day)
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  });
};

export const calculateBudgetInsights = ({
  days,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startBalances,
  budgetYear,
  budgetMonth,
  today = new Date()
}: BudgetInsightParams): BudgetInsights => {
  const visibleDays = getVisibleMonthDays(days, budgetYear, budgetMonth);
  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);
  const elapsedDays = getElapsedDaysInBudgetMonth(budgetYear, budgetMonth, daysInMonth, today);
  const remainingDays = Math.max(daysInMonth - elapsedDays, 0);
  const transactions = flattenMonthlyTransactions({
    days,
    displayCurrency,
    exchangeRates,
    budgetYear,
    budgetMonth
  });

  let totalIncome = 0;
  let totalExpense = 0;
  let noSpendDays = 0;
  let daysWithTransactions = 0;

  visibleDays.forEach((day, index) => {
    const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
    const transactionsForDay = Array.isArray(day?.transactions) ? day.transactions : [];
    let dayExpense = 0;

    selectedCurrencies.forEach((currencyCode) => {
      const income = amounts[`income${currencyCode}`] || 0;
      const expense = amounts[`expense${currencyCode}`] || 0;

      totalIncome += convertCurrency(income, currencyCode, displayCurrency, exchangeRates);
      totalExpense += convertCurrency(expense, currencyCode, displayCurrency, exchangeRates);
      dayExpense += expense;
    });

    if (transactionsForDay.length > 0) {
      daysWithTransactions++;
    }

    if (index < elapsedDays && dayExpense === 0) {
      noSpendDays++;
    }
  });

  const totalStartBalance = selectedCurrencies.reduce((sum, currencyCode) => {
    const balance = Number(startBalances[currencyCode]) || 0;
    return sum + convertCurrency(balance, currencyCode, displayCurrency, exchangeRates);
  }, 0);

  const averageDailyExpense = elapsedDays > 0 ? totalExpense / elapsedDays : 0;
  const projectedExpense = averageDailyExpense * daysInMonth;
  const projectedEndBalance = totalStartBalance + totalIncome - projectedExpense;
  const netCashFlow = totalIncome - totalExpense;
  const currentAvailableBalance = totalStartBalance + netCashFlow;
  const remainingDailyBudget =
    remainingDays > 0 ? currentAvailableBalance / remainingDays : currentAvailableBalance;
  const monthProgress = daysInMonth > 0 ? (elapsedDays / daysInMonth) * 100 : 0;
  const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpense,
    netCashFlow,
    totalStartBalance,
    projectedEndBalance,
    projectedExpense,
    averageDailyExpense,
    remainingDailyBudget,
    noSpendDays,
    daysWithTransactions,
    elapsedDays,
    remainingDays,
    daysInMonth,
    monthProgress,
    savingsRate,
    topExpenses: transactions
      .filter((transaction) => transaction.type === 'expense')
      .sort((a, b) => b.convertedAmount - a.convertedAmount)
      .slice(0, 5),
    transactions
  };
};
