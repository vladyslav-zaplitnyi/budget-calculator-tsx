import { Day, ExchangeRates, MonthSlice } from '../types';
import {
  flattenOverviewTransactions,
  overviewMonthHasTransactions,
  resolveOverviewMonthDays,
  resolveOverviewMonthStartBalances,
  type OverviewMonthDaysContext,
  type OverviewMonthRef,
  type OverviewTransaction
} from './budgetInsights';
import { convertCurrency } from './calculations';
import {
  UNCATEGORIZED_KEY,
  buildExpenseCategoryBreakdown,
  type CategoryGroup
} from './expenseDescriptionBreakdown';
import { parseMonthKey } from './monthlyPlan';
import { getDefaultOverviewWindow } from './rollingMonthsBudget';
import { capitalizeFirstLetter, getDaysInMonth } from './dateHelpers';
import { sanitizeFileNamePart } from './fileNameSanitizer';

export interface PdfReportMonthRow {
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  income: number;
  expense: number;
  net: number;
  startBalance: number;
  endBalance: number;
  transactionCount: number;
  daysInMonth: number;
  hasData: boolean;
}

export interface PdfReportTopExpense {
  description: string;
  convertedAmount: number;
  currency: string;
  amount: number;
  day: number;
  monthKey: string;
  monthLabel: string;
  category?: string;
}

export type PdfReportInsight =
  | { id: 'netPositive'; amount: number }
  | { id: 'netNegative'; amount: number }
  | { id: 'bestMonth'; monthKey: string; amount: number }
  | { id: 'highestSpendMonth'; monthKey: string; amount: number }
  | { id: 'topCategory'; categoryId: string; percentage: number }
  | { id: 'overspentMonths'; count: number }
  | { id: 'savingsRate'; percent: number }
  | { id: 'spendingRatio'; percent: number }
  | { id: 'peakVsAverage'; percent: number };

export interface PdfReportTotals {
  income: number;
  expense: number;
  net: number;
  startBalance: number;
  endBalance: number;
  remaining: number;
  savingsRate: number;
  spendingOfIncome: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  avgDailyExpense: number;
  transactionCount: number;
  monthCount: number;
  filledMonthCount: number;
}

export interface PdfReportData {
  budgetName: string;
  displayCurrency: string;
  locale: string;
  generatedAt: Date;
  periodContiguous: boolean;
  months: PdfReportMonthRow[];
  totals: PdfReportTotals;
  categories: CategoryGroup[];
  topExpenses: PdfReportTopExpense[];
  insights: PdfReportInsight[];
}

export interface BuildPdfReportParams {
  monthKeys: string[];
  availableMonths: OverviewMonthRef[];
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey?: string;
  activeDays?: Day[];
  activeStartBalances?: Record<string, number | null>;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  budgetName: string;
  locale: string;
  today?: Date;
}

const startBalanceDisplay = (
  startBalances: Record<string, number | null> | undefined,
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): number =>
  selectedCurrencies.reduce((sum, code) => {
    const balance = Number(startBalances?.[code]) || 0;
    return sum + convertCurrency(balance, code, displayCurrency, exchangeRates);
  }, 0);

const monthFlowDisplay = (
  days: Day[],
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): { income: number; expense: number; transactionCount: number } => {
  let income = 0;
  let expense = 0;
  let transactionCount = 0;

  days.forEach((day) => {
    const transactions = Array.isArray(day?.transactions) ? day.transactions : [];
    transactionCount += transactions.length;
    transactions.forEach((tx) => {
      const converted = convertCurrency(
        Number(tx.amount) || 0,
        tx.currency,
        displayCurrency,
        exchangeRates
      );
      if (tx.type === 'income') income += converted;
      else if (tx.type === 'expense') expense += converted;
    });
  });

  return { income, expense, transactionCount };
};

export const monthChartLabel = (
  locale: string,
  year: number,
  month: number,
  includeYear: boolean
): string => {
  const monthPart = new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(new Date(year, month, 1))
    .replace(/\.$/, '');
  const cleaned = capitalizeFirstLetter(monthPart);
  if (!includeYear) return cleaned;
  return `${cleaned} ${String(year).slice(-2)}`;
};

export const monthFullLabel = (locale: string, year: number, month: number): string =>
  capitalizeFirstLetter(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(year, month, 1)
    )
  );

const monthIndex = (year: number, month: number): number => year * 12 + month;

export const areMonthKeysContiguous = (keys: string[]): boolean => {
  if (keys.length <= 1) return true;
  const parsed = keys
    .map((key) => parseMonthKey(key))
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (parsed.length !== keys.length) return false;
  return parsed.every((item, index) => {
    if (index === 0) return true;
    const prev = parsed[index - 1];
    return monthIndex(item.year, item.month) - monthIndex(prev.year, prev.month) === 1;
  });
};

/** Months the user can put in a PDF: stored slices, the 12-month window, and the active month. */
export const listPdfExportableMonths = (
  context: OverviewMonthDaysContext,
  windowMonths: OverviewMonthRef[] = getDefaultOverviewWindow()
): OverviewMonthRef[] => {
  const byKey = new Map<string, OverviewMonthRef>();

  windowMonths.forEach((month) => {
    byKey.set(month.key, month);
  });

  Object.keys(context.monthsByKey || {}).forEach((key) => {
    if (byKey.has(key)) return;
    const parsed = parseMonthKey(key);
    if (!parsed) return;
    byKey.set(parsed.key, { key: parsed.key, year: parsed.year, month: parsed.month });
  });

  if (context.activeMonthKey && !byKey.has(context.activeMonthKey)) {
    const parsed = parseMonthKey(context.activeMonthKey);
    if (parsed) {
      byKey.set(parsed.key, { key: parsed.key, year: parsed.year, month: parsed.month });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
};

export const defaultSelectedPdfMonthKeys = (
  availableMonths: OverviewMonthRef[],
  context: OverviewMonthDaysContext
): string[] => {
  const filled = availableMonths
    .filter((month) => overviewMonthHasTransactions(month, context))
    .map((month) => month.key);
  if (filled.length > 0) return filled;
  if (context.activeMonthKey && availableMonths.some((month) => month.key === context.activeMonthKey)) {
    return [context.activeMonthKey];
  }
  return availableMonths[0] ? [availableMonths[0].key] : [];
};

const savingsRateFromRemaining = (remaining: number, totalExpense: number): number => {
  const available = remaining + totalExpense;
  return available > 0 ? (remaining / available) * 100 : 0;
};

const buildInsights = (
  months: PdfReportMonthRow[],
  totals: PdfReportTotals,
  categories: CategoryGroup[]
): PdfReportInsight[] => {
  const insights: PdfReportInsight[] = [];
  const dataMonths = months.filter((month) => month.hasData);

  if (totals.net >= 0 && (totals.income > 0 || totals.expense > 0)) {
    insights.push({ id: 'netPositive', amount: totals.net });
  } else if (totals.net < 0) {
    insights.push({ id: 'netNegative', amount: Math.abs(totals.net) });
  }

  if (totals.income > 0 || totals.startBalance > 0) {
    insights.push({ id: 'savingsRate', percent: totals.savingsRate });
  }

  if (totals.income > 0) {
    insights.push({ id: 'spendingRatio', percent: totals.spendingOfIncome });
  }

  if (dataMonths.length > 0) {
    const best = dataMonths.reduce((winner, month) => (month.net > winner.net ? month : winner));
    insights.push({ id: 'bestMonth', monthKey: best.key, amount: best.net });

    const spendiest = dataMonths.reduce((winner, month) =>
      month.expense > winner.expense ? month : winner
    );
    if (spendiest.expense > 0) {
      insights.push({
        id: 'highestSpendMonth',
        monthKey: spendiest.key,
        amount: spendiest.expense
      });
    }
  }

  const topCategory = categories[0];
  if (topCategory && topCategory.totalAmount > 0) {
    insights.push({
      id: 'topCategory',
      categoryId: topCategory.id,
      percentage: topCategory.percentage
    });
  }

  const overspent = dataMonths.filter((month) => month.expense > month.income).length;
  if (overspent > 0) {
    insights.push({ id: 'overspentMonths', count: overspent });
  }

  if (dataMonths.length >= 2 && totals.avgMonthlyExpense > 0) {
    const peak = Math.max(...dataMonths.map((month) => month.expense));
    const percent = ((peak - totals.avgMonthlyExpense) / totals.avgMonthlyExpense) * 100;
    if (percent >= 5) {
      insights.push({ id: 'peakVsAverage', percent });
    }
  }

  return insights;
};

export const buildPdfReportData = ({
  monthKeys,
  availableMonths,
  monthsByKey,
  activeMonthKey,
  activeDays,
  activeStartBalances,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  budgetName,
  locale,
  today = new Date()
}: BuildPdfReportParams): PdfReportData => {
  const availableByKey = new Map(availableMonths.map((month) => [month.key, month]));
  const selectedRefs = Array.from(new Set(monthKeys))
    .map((key) => availableByKey.get(key))
    .filter((month): month is OverviewMonthRef => Boolean(month))
    .sort((a, b) => a.key.localeCompare(b.key));

  const context: OverviewMonthDaysContext = { monthsByKey, activeMonthKey, activeDays };
  const years = new Set(selectedRefs.map((month) => month.year));
  const includeYear = years.size > 1;

  const months: PdfReportMonthRow[] = selectedRefs.map((windowMonth) => {
    const days = resolveOverviewMonthDays({ ...context, windowMonth });
    const startBalances = resolveOverviewMonthStartBalances({
      ...context,
      windowMonth,
      activeStartBalances
    });
    const flow = monthFlowDisplay(days, selectedCurrencies, displayCurrency, exchangeRates);
    const startBalance = startBalanceDisplay(
      startBalances,
      selectedCurrencies,
      displayCurrency,
      exchangeRates
    );
    const net = flow.income - flow.expense;

    return {
      key: windowMonth.key,
      year: windowMonth.year,
      month: windowMonth.month,
      label: monthFullLabel(locale, windowMonth.year, windowMonth.month),
      shortLabel: monthChartLabel(locale, windowMonth.year, windowMonth.month, includeYear),
      income: flow.income,
      expense: flow.expense,
      net,
      startBalance,
      endBalance: startBalance + net,
      transactionCount: flow.transactionCount,
      daysInMonth: getDaysInMonth(windowMonth.year, windowMonth.month),
      hasData: overviewMonthHasTransactions(windowMonth, context)
    };
  });

  const income = months.reduce((sum, month) => sum + month.income, 0);
  const expense = months.reduce((sum, month) => sum + month.expense, 0);
  const net = income - expense;
  const startBalance = months[0]?.startBalance ?? 0;
  const endBalance = months[months.length - 1]?.endBalance ?? startBalance;
  const remaining = startBalance + net;
  const totalDays = months.reduce((sum, month) => sum + month.daysInMonth, 0);
  const filledMonthCount = months.filter((month) => month.hasData).length;
  const monthCount = months.length || 1;

  const totals: PdfReportTotals = {
    income,
    expense,
    net,
    startBalance,
    endBalance,
    remaining,
    savingsRate: savingsRateFromRemaining(remaining, expense),
    spendingOfIncome: income > 0 ? Math.min((expense / income) * 100, 999) : 0,
    avgMonthlyIncome: income / monthCount,
    avgMonthlyExpense: expense / monthCount,
    avgDailyExpense: totalDays > 0 ? expense / totalDays : 0,
    transactionCount: months.reduce((sum, month) => sum + month.transactionCount, 0),
    monthCount: months.length,
    filledMonthCount
  };

  const overviewTransactions: OverviewTransaction[] = flattenOverviewTransactions({
    monthsByKey,
    windowMonths: selectedRefs,
    displayCurrency,
    exchangeRates,
    activeMonthKey,
    activeDays
  });

  const expenseTransactions = overviewTransactions.filter((tx) => tx.type === 'expense');
  const categories = buildExpenseCategoryBreakdown(expenseTransactions);
  const labelByKey = new Map(months.map((month) => [month.key, month.label]));

  const topExpenses: PdfReportTopExpense[] = [...expenseTransactions]
    .sort((a, b) => b.convertedAmount - a.convertedAmount)
    .slice(0, 8)
    .map((tx) => ({
      description: (tx.description || '').trim() || '—',
      convertedAmount: tx.convertedAmount,
      currency: tx.currency,
      amount: Number(tx.amount) || 0,
      day: tx.day,
      monthKey: tx.monthKey,
      monthLabel: labelByKey.get(tx.monthKey) || tx.monthKey,
      category: tx.category
    }));

  return {
    budgetName: budgetName.trim() || 'Budget',
    displayCurrency,
    locale,
    generatedAt: today,
    periodContiguous: areMonthKeysContiguous(selectedRefs.map((month) => month.key)),
    months,
    totals,
    categories,
    topExpenses,
    insights: buildInsights(months, totals, categories)
  };
};

export const isUncategorizedPdfCategory = (categoryId: string): boolean =>
  categoryId === UNCATEGORIZED_KEY;

export const buildPdfExportFileName = (
  budgetName: string,
  months: PdfReportMonthRow[],
  generatedAt: Date = new Date()
): string => {
  const y = generatedAt.getFullYear();
  const mo = String(generatedAt.getMonth() + 1).padStart(2, '0');
  const d = String(generatedAt.getDate()).padStart(2, '0');
  const first = months[0]?.key || 'months';
  const last = months[months.length - 1]?.key || first;
  const range = first === last ? first : `${first}_${last}`;
  const safeName = sanitizeFileNamePart(budgetName, 'budget');
  return `budget_${safeName}_report_${range}_${y}-${mo}-${d}.pdf`;
};
