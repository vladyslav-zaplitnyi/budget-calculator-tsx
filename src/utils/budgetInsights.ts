import { Day, ExchangeRates, MonthSlice, Transaction } from '../types';
import {
  calculateDayAmountsFromTransactions,
  calculateFinalBalances,
  calculateTotals,
  convertCurrency,
  Totals
} from './calculations';
import { getDaysInMonth } from './dateHelpers';
import {
  buildTwelveMonthBalanceRows,
  getDefaultOverviewWindow
} from './rollingMonthsBudget';

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
  remainingBalance: number;
  filledMonthCount: number;
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

export interface OverviewTransaction extends MonthlyTransaction {
  year: number;
  month: number;
  monthKey: string;
}

export interface OverviewMonthRef {
  year: number;
  month: number;
  key: string;
}

export interface OverviewMonthDaysContext {
  monthsByKey: Record<string, MonthSlice> | undefined;
  activeMonthKey?: string;
  activeDays?: Day[];
}

export const resolveOverviewMonthDays = ({
  monthsByKey,
  windowMonth,
  activeMonthKey,
  activeDays
}: OverviewMonthDaysContext & {
  windowMonth: OverviewMonthRef;
}): Day[] => {
  if (activeMonthKey === windowMonth.key && activeDays) {
    return getVisibleMonthDays(activeDays, windowMonth.year, windowMonth.month);
  }
  const slice = monthsByKey?.[windowMonth.key];
  return getVisibleMonthDays(slice?.days || [], windowMonth.year, windowMonth.month);
};

export const resolveOverviewMonthStartBalances = ({
  monthsByKey,
  windowMonth,
  activeMonthKey,
  activeStartBalances
}: OverviewMonthDaysContext & {
  windowMonth: OverviewMonthRef;
  activeStartBalances?: Record<string, number | null>;
}): Record<string, number | null> => {
  if (activeMonthKey === windowMonth.key && activeStartBalances) {
    return activeStartBalances;
  }
  return monthsByKey?.[windowMonth.key]?.startBalances ?? {};
};

/** Closing balances of the last month that has transactions (per currency). */
export const getOverviewWindowFinalBalances = ({
  monthsByKey,
  selectedCurrencies,
  activeMonthKey,
  activeDays,
  activeStartBalances
}: OverviewMonthDaysContext & {
  selectedCurrencies: string[];
  activeStartBalances?: Record<string, number | null>;
}): Record<string, number> => {
  const filledMonths = getFilledOverviewMonths({ monthsByKey, activeMonthKey, activeDays });
  const empty: Record<string, number> = {};
  selectedCurrencies.forEach((code) => {
    empty[`finalBalance${code}`] = 0;
  });
  if (filledMonths.length === 0) {
    return empty;
  }

  const lastMonth = filledMonths[filledMonths.length - 1];
  const days = resolveOverviewMonthDays({
    monthsByKey,
    windowMonth: lastMonth,
    activeMonthKey,
    activeDays
  });
  const startBalances = resolveOverviewMonthStartBalances({
    monthsByKey,
    windowMonth: lastMonth,
    activeMonthKey,
    activeStartBalances
  });
  const totals = calculateTotals(days, selectedCurrencies);
  return calculateFinalBalances(days, selectedCurrencies, startBalances, totals);
};

const toDisplayAmount = (
  startBalances: Record<string, number | null> | undefined,
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): number =>
  selectedCurrencies.reduce((sum, currencyCode) => {
    const balance = Number(startBalances?.[currencyCode]) || 0;
    return sum + convertCurrency(balance, currencyCode, displayCurrency, exchangeRates);
  }, 0);

const savingsRateFromRemaining = (remaining: number, totalExpense: number): number => {
  const available = remaining + totalExpense;
  return available > 0 ? (remaining / available) * 100 : 0;
};

/** Month counts as filled when it has at least one transaction. */
export const overviewMonthHasTransactions = (
  windowMonth: OverviewMonthRef,
  context: OverviewMonthDaysContext
): boolean => {
  const monthDays = resolveOverviewMonthDays({ ...context, windowMonth });
  return monthDays.some(
    (day) => Array.isArray(day?.transactions) && day.transactions.length > 0
  );
};

/** 12-month window slots that contain transaction data (empty future months are skipped). */
export const getFilledOverviewMonths = (
  context: OverviewMonthDaysContext,
  windowMonths: OverviewMonthRef[] = getDefaultOverviewWindow()
): OverviewMonthRef[] =>
  windowMonths.filter((windowMonth) => overviewMonthHasTransactions(windowMonth, context));

export const aggregateTotalsForOverviewWindow = ({
  monthsByKey,
  selectedCurrencies,
  activeMonthKey,
  activeDays,
  windowMonths = getFilledOverviewMonths({ monthsByKey, activeMonthKey, activeDays })
}: OverviewMonthDaysContext & {
  selectedCurrencies: string[];
  windowMonths?: OverviewMonthRef[];
}): Totals => {
  const aggregated: Totals = {};
  selectedCurrencies.forEach((code) => {
    aggregated[`totalIncome${code}`] = 0;
    aggregated[`totalExpense${code}`] = 0;
  });

  windowMonths.forEach((windowMonth) => {
    const monthDays = resolveOverviewMonthDays({
      monthsByKey,
      windowMonth,
      activeMonthKey,
      activeDays
    });
    const monthTotals = calculateTotals(monthDays, selectedCurrencies);
    selectedCurrencies.forEach((code) => {
      aggregated[`totalIncome${code}`] =
        (aggregated[`totalIncome${code}`] || 0) + (monthTotals[`totalIncome${code}`] || 0);
      aggregated[`totalExpense${code}`] =
        (aggregated[`totalExpense${code}`] || 0) + (monthTotals[`totalExpense${code}`] || 0);
    });
  });

  return aggregated;
};

export interface OverviewTransactionFilters extends TransactionFilters {
  month?: string | 'all';
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

export const flattenOverviewTransactions = ({
  monthsByKey,
  windowMonths,
  displayCurrency,
  exchangeRates,
  activeMonthKey,
  activeDays
}: {
  monthsByKey: Record<string, MonthSlice> | undefined;
  windowMonths: OverviewMonthRef[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  activeMonthKey?: string;
  activeDays?: Day[];
}): OverviewTransaction[] => {
  const result: OverviewTransaction[] = [];

  windowMonths.forEach((windowMonth) => {
    const { year, month, key } = windowMonth;
    const days = resolveOverviewMonthDays({
      monthsByKey,
      windowMonth,
      activeMonthKey,
      activeDays
    });
    const monthly = flattenMonthlyTransactions({
      days,
      displayCurrency,
      exchangeRates,
      budgetYear: year,
      budgetMonth: month
    });

    monthly.forEach((transaction) => {
      result.push({
        ...transaction,
        year,
        month,
        monthKey: key
      });
    });
  });

  return result.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
};

export const filterOverviewTransactions = (
  transactions: OverviewTransaction[],
  filters: OverviewTransactionFilters
): OverviewTransaction[] => {
  const month = filters.month || 'all';
  const search = (filters.search || '').trim().toLowerCase();

  const filtered = transactions.filter((transaction) => {
    const type = filters.type || 'all';
    const currency = filters.currency || 'all';
    const day = filters.day || 'all';

    if (type !== 'all' && transaction.type !== type) return false;
    if (currency !== 'all' && transaction.currency !== currency) return false;
    if (day !== 'all' && transaction.day !== day) return false;
    if (month !== 'all' && transaction.monthKey !== month) return false;

    if (!search) return true;
    const haystack = [
      transaction.description,
      transaction.currency,
      String(transaction.amount),
      String(transaction.day),
      transaction.monthKey
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });

  return filtered;
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
  const netCashFlow = totalIncome - totalExpense;
  const remainingBalance = totalStartBalance + netCashFlow;
  const projectedEndBalance = totalStartBalance + totalIncome - projectedExpense;
  const remainingDailyBudget =
    remainingDays > 0 ? remainingBalance / remainingDays : remainingBalance;
  const monthProgress = daysInMonth > 0 ? (elapsedDays / daysInMonth) * 100 : 0;
  const savingsRate = savingsRateFromRemaining(remainingBalance, totalExpense);

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
    remainingBalance,
    filledMonthCount: 1,
    topExpenses: transactions
      .filter((transaction) => transaction.type === 'expense')
      .sort((a, b) => b.convertedAmount - a.convertedAmount)
      .slice(0, 5),
    transactions
  };
};

export interface TwelveMonthInsightParams extends OverviewMonthDaysContext {
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  startBalances: Record<string, number | null>;
  activeStartBalances?: Record<string, number | null>;
  today?: Date;
}

export const calculateTwelveMonthBudgetInsights = ({
  monthsByKey,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startBalances,
  activeMonthKey,
  activeDays,
  activeStartBalances,
  today = new Date()
}: TwelveMonthInsightParams): BudgetInsights => {
  const monthContext = { monthsByKey, activeMonthKey, activeDays };
  const filledMonths = getFilledOverviewMonths(monthContext);
  let totalIncome = 0;
  let totalExpense = 0;
  let noSpendDays = 0;
  let daysWithTransactions = 0;
  let totalDaysInWindow = 0;
  let elapsedDaysInWindow = 0;

  filledMonths.forEach((windowMonth) => {
    const { year, month } = windowMonth;
    const visibleDays = resolveOverviewMonthDays({
      monthsByKey,
      windowMonth,
      activeMonthKey,
      activeDays
    });
    const daysInMonth = getDaysInMonth(year, month);
    const elapsedDays = getElapsedDaysInBudgetMonth(year, month, daysInMonth, today);
    totalDaysInWindow += daysInMonth;
    elapsedDaysInWindow += elapsedDays;

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
  });

  const transactions = flattenOverviewTransactions({
    monthsByKey,
    windowMonths: filledMonths,
    displayCurrency,
    exchangeRates,
    activeMonthKey,
    activeDays
  });

  const firstFilled = filledMonths[0];
  const openingStartBalances = firstFilled
    ? resolveOverviewMonthStartBalances({
        monthsByKey,
        windowMonth: firstFilled,
        activeMonthKey,
        activeStartBalances: activeStartBalances ?? startBalances
      })
    : startBalances;
  const totalStartBalance = toDisplayAmount(
    openingStartBalances,
    selectedCurrencies,
    displayCurrency,
    exchangeRates
  );

  const balanceRows = buildTwelveMonthBalanceRows({
    monthsByKey,
    selectedCurrencies,
    displayCurrency,
    exchangeRates,
    activeMonthKey,
    activeDays,
    activeStartBalances
  });
  const filledMonthKeys = new Set(filledMonths.map((month) => month.key));
  const lastFilledBalanceRow = [...balanceRows]
    .reverse()
    .find((row) => filledMonthKeys.has(row.key));
  const remainingBalance = lastFilledBalanceRow?.balance ?? totalStartBalance;
  const projectedEndBalance = remainingBalance;

  const netCashFlow = totalIncome - totalExpense;
  const remainingDays = Math.max(totalDaysInWindow - elapsedDaysInWindow, 0);
  const remainingDailyBudget =
    remainingDays > 0 ? remainingBalance / remainingDays : remainingBalance;
  const averageDailyExpense = totalDaysInWindow > 0 ? totalExpense / totalDaysInWindow : 0;
  const projectedExpense = averageDailyExpense * totalDaysInWindow;
  const monthProgress =
    totalDaysInWindow > 0 ? (elapsedDaysInWindow / totalDaysInWindow) * 100 : 0;
  const savingsRate = savingsRateFromRemaining(remainingBalance, totalExpense);

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
    elapsedDays: elapsedDaysInWindow,
    remainingDays,
    daysInMonth: totalDaysInWindow,
    monthProgress,
    savingsRate,
    remainingBalance,
    filledMonthCount: filledMonths.length,
    topExpenses: transactions
      .filter((transaction) => transaction.type === 'expense')
      .sort((a, b) => b.convertedAmount - a.convertedAmount)
      .slice(0, 5),
    transactions
  };
};
