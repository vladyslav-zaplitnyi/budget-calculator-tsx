import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency, formatNumber, calculateDayAmountsFromTransactions } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { capitalizeFirstLetter, getDaysInMonth, getMonthYearLabel } from '../utils/dateHelpers';
import { Day, ExchangeRates, MonthSlice, Transaction } from '../types';
import {
  getElapsedDaysInBudgetMonth,
  getFilledOverviewMonths,
  resolveOverviewMonthDays
} from '../utils/budgetInsights';
import { buildTwelveMonthBalanceRows } from '../utils/rollingMonthsBudget';
import CurrencyFlag from './CurrencyFlag';
import type { BudgetViewMode } from './BudgetViewToggle';

interface AnalyticsProps {
  days: Day[];
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  startBalances: Record<string, number | null>;
  budgetYear: number;
  budgetMonth: number;
  budgetViewMode?: BudgetViewMode;
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey?: string;
}

interface TopExpense {
  description: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  day: number;
  monthLabel?: string;
}

interface CategoryData {
  name: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

interface WeekData {
  weekNumber: number;
  totalExpense: number;
  totalIncome: number;
  daysRange: string;
  periodLabel?: string;
}

const Analytics: React.FC<AnalyticsProps> = ({
  days,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startBalances,
  budgetYear,
  budgetMonth,
  budgetViewMode = 'days',
  monthsByKey,
  activeMonthKey
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const displaySymbol = getCurrencySymbol(displayCurrency);
  const isTwelveMonthView = budgetViewMode === 'months';
  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);
  const visibleDays = days.slice(0, daysInMonth);
  const filledOverviewMonths = useMemo(
    () =>
      getFilledOverviewMonths({
        monthsByKey,
        activeMonthKey,
        activeDays: days
      }),
    [monthsByKey, activeMonthKey, days]
  );

  const analyticsExpandedStorageKey = 'budget_analytics_expanded';
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true;
      const stored = window.localStorage.getItem(analyticsExpandedStorageKey);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(analyticsExpandedStorageKey, String(next));
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  // ---------- Обчислення аналітичних даних ----------

  const analytics = useMemo(() => {
    let totalIncomeConverted = 0;
    let totalExpenseConverted = 0;
    let noSpendDayCount = 0;
    let daysWithTransactions = 0;
    const allExpenses: TopExpense[] = [];

    const dayEntries: Array<{ day: Day; elapsed: boolean; monthLabel?: string }> = [];

    if (isTwelveMonthView) {
      filledOverviewMonths.forEach((windowMonth) => {
        const monthDays = resolveOverviewMonthDays({
          monthsByKey,
          windowMonth,
          activeMonthKey,
          activeDays: days
        });
        const monthDaysCount = getDaysInMonth(windowMonth.year, windowMonth.month);
        const elapsed = getElapsedDaysInBudgetMonth(
          windowMonth.year,
          windowMonth.month,
          monthDaysCount
        );
        const monthLabel = capitalizeFirstLetter(
          getMonthYearLabel(locale, windowMonth.year, windowMonth.month)
        );
        monthDays.forEach((day, index) => {
          dayEntries.push({ day, elapsed: index < elapsed, monthLabel });
        });
      });
    } else {
      visibleDays.forEach((day) => {
        if (day) dayEntries.push({ day, elapsed: true });
      });
    }

    dayEntries.forEach(({ day, elapsed, monthLabel }) => {
      if (!day) return;
      const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
      const transactions = Array.isArray(day.transactions) ? day.transactions : [];

      let dayHasExpense = false;

      selectedCurrencies.forEach((code) => {
        const income = amounts[`income${code}`] || 0;
        const expense = amounts[`expense${code}`] || 0;
        totalIncomeConverted += convertCurrency(income, code, displayCurrency, exchangeRates);
        totalExpenseConverted += convertCurrency(expense, code, displayCurrency, exchangeRates);
        if (expense > 0) dayHasExpense = true;
      });

      // Збираємо всі витрати для топ-5
      transactions.forEach((tx: Transaction) => {
        if (tx.type === 'expense') {
          const converted = convertCurrency(
            tx.amount,
            tx.currency,
            displayCurrency,
            exchangeRates
          );
          allExpenses.push({
            description: tx.description || '—',
            amount: tx.amount,
            currency: tx.currency,
            convertedAmount: converted,
            day: day.day,
            monthLabel
          });
        }
      });

      if (transactions.length > 0) {
        daysWithTransactions++;
      }

      if (elapsed && !dayHasExpense) {
        noSpendDayCount++;
      }
    });

    // Топ-5 найбільших витрат
    const topExpenses = [...allExpenses]
      .sort((a, b) => b.convertedAmount - a.convertedAmount)
      .slice(0, 5);

    // Середні щоденні витрати (лише по днях, де були транзакції, або по всіх днях)
    const activeDaysCount = daysWithTransactions || 1;
    const avgDailyExpense = totalExpenseConverted / activeDaysCount;

    const periodDaysCount = isTwelveMonthView
      ? filledOverviewMonths.reduce(
          (sum, windowMonth) => sum + getDaysInMonth(windowMonth.year, windowMonth.month),
          0
        )
      : daysInMonth;

    // Прогнозована загальна витрата до кінця періоду
    const projectedTotalExpense = avgDailyExpense * periodDaysCount;

    // Прогнозований баланс на кінець періоду
    let totalStartBalance = 0;
    selectedCurrencies.forEach((code) => {
      const balance = parseFloat(String(startBalances[code])) || 0;
      totalStartBalance += convertCurrency(balance, code, displayCurrency, exchangeRates);
    });

    const projectedEndBalance = isTwelveMonthView
      ? (() => {
          const balanceRows = buildTwelveMonthBalanceRows({
            monthsByKey,
            selectedCurrencies,
            displayCurrency,
            exchangeRates,
            activeMonthKey,
            activeDays: days,
            activeStartBalances: startBalances
          });
          const filledMonthKeys = new Set(filledOverviewMonths.map((month) => month.key));
          const lastFilledBalanceRow = [...balanceRows]
            .reverse()
            .find((row) => filledMonthKeys.has(row.key));
          return lastFilledBalanceRow?.balance ?? totalStartBalance;
        })()
      : totalStartBalance + totalIncomeConverted - projectedTotalExpense;

    // Рівень заощаджень
    const savingsRate =
      totalIncomeConverted > 0
        ? ((totalIncomeConverted - totalExpenseConverted) / totalIncomeConverted) * 100
        : 0;

    // Прогрес витрат відносно доходу (%)
    const spendingProgress =
      totalIncomeConverted > 0
        ? Math.min((totalExpenseConverted / totalIncomeConverted) * 100, 100)
        : 0;

    // ---------- Витрати за категоріями ----------
    const categoryMap = new Map<string, { totalAmount: number; count: number }>();
    allExpenses.forEach((expense) => {
      const key = (expense.description || '').trim().toLowerCase() || '—';
      if (categoryMap.has(key)) {
        const existing = categoryMap.get(key)!;
        existing.totalAmount += expense.convertedAmount;
        existing.count += 1;
      } else {
        categoryMap.set(key, { totalAmount: expense.convertedAmount, count: 1 });
      }
    });

    // Конвертуємо в масив та сортуємо за сумою
    const categoriesRaw = Array.from(categoryMap.entries())
      .map(([key, data]) => ({
        name: key === '—' ? '—' : key,
        totalAmount: data.totalAmount,
        count: data.count,
        percentage: totalExpenseConverted > 0 ? (data.totalAmount / totalExpenseConverted) * 100 : 0
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Показуємо топ-6, решту об'єднуємо в "Інше"
    let categories: CategoryData[];
    if (categoriesRaw.length > 7) {
      const top6 = categoriesRaw.slice(0, 6);
      const otherTotal = categoriesRaw.slice(6).reduce((sum, c) => sum + c.totalAmount, 0);
      const otherCount = categoriesRaw.slice(6).reduce((sum, c) => sum + c.count, 0);
      categories = [
        ...top6,
        {
          name: '__other__',
          totalAmount: otherTotal,
          count: otherCount,
          percentage: totalExpenseConverted > 0 ? (otherTotal / totalExpenseConverted) * 100 : 0
        }
      ];
    } else {
      categories = categoriesRaw;
    }

    // Capitalize display name
    categories = categories.map(c => ({
      ...c,
      name: c.name === '__other__' ? '__other__' : c.name === '—' ? '—' : c.name.charAt(0).toUpperCase() + c.name.slice(1)
    }));

    // ---------- Тижневий / місячний розподіл ----------
    const weeks: WeekData[] = [];

    if (isTwelveMonthView) {
      filledOverviewMonths.forEach((windowMonth, index) => {
        const monthDays = resolveOverviewMonthDays({
          monthsByKey,
          windowMonth,
          activeMonthKey,
          activeDays: days
        });
        let monthExpense = 0;
        let monthIncome = 0;
        monthDays.forEach((dayData) => {
          if (!dayData) return;
          const amounts = calculateDayAmountsFromTransactions(dayData, selectedCurrencies);
          for (const code of selectedCurrencies) {
            monthExpense += convertCurrency(amounts[`expense${code}`] || 0, code, displayCurrency, exchangeRates);
            monthIncome += convertCurrency(amounts[`income${code}`] || 0, code, displayCurrency, exchangeRates);
          }
        });
        weeks.push({
          weekNumber: index + 1,
          totalExpense: monthExpense,
          totalIncome: monthIncome,
          daysRange: '',
          periodLabel: capitalizeFirstLetter(getMonthYearLabel(locale, windowMonth.year, windowMonth.month))
        });
      });
    } else {
      // Розбиваємо дні на тижні (Пн-Нд)
      let weekNum = 1;
      let weekStart = 1;

      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(budgetYear, budgetMonth, d).getDay();
        if (dayOfWeek === 0 || d === daysInMonth) {
          let weekExpense = 0;
          let weekIncome = 0;
          for (let wd = weekStart - 1; wd < d && wd < visibleDays.length; wd++) {
            const dayData = visibleDays[wd];
            if (!dayData) continue;
            const amounts = calculateDayAmountsFromTransactions(dayData, selectedCurrencies);
            for (const code of selectedCurrencies) {
              weekExpense += convertCurrency(amounts[`expense${code}`] || 0, code, displayCurrency, exchangeRates);
              weekIncome += convertCurrency(amounts[`income${code}`] || 0, code, displayCurrency, exchangeRates);
            }
          }
          weeks.push({
            weekNumber: weekNum,
            totalExpense: weekExpense,
            totalIncome: weekIncome,
            daysRange: `${weekStart}–${d}`
          });
          weekNum++;
          weekStart = d + 1;
        }
      }
    }

    const maxWeekExpense = Math.max(...weeks.map(w => w.totalExpense), 1);

    // ---------- Серія ощадних днів ----------
    // Рахуємо серію днів, де витрати < середнього
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    const streakDays = dayEntries.map((entry) => entry.day);

    // Проходимо по днях з транзакціями
    for (let i = 0; i < streakDays.length; i++) {
      const dayData = streakDays[i];
      if (!dayData) continue;
      const transactions = Array.isArray(dayData.transactions) ? dayData.transactions : [];
      if (transactions.length === 0) continue;

      let dayExpenseConverted = 0;
      const amounts = calculateDayAmountsFromTransactions(dayData, selectedCurrencies);
      selectedCurrencies.forEach((code) => {
        dayExpenseConverted += convertCurrency(amounts[`expense${code}`] || 0, code, displayCurrency, exchangeRates);
      });

      if (dayExpenseConverted <= avgDailyExpense) {
        tempStreak++;
        if (tempStreak > bestStreak) {
          bestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }
    currentStreak = tempStreak;

    return {
      totalIncomeConverted,
      totalExpenseConverted,
      avgDailyExpense,
      projectedEndBalance,
      topExpenses,
      noSpendDayCount,
      savingsRate,
      spendingProgress,
      daysWithTransactions,
      daysInMonth: periodDaysCount,
      categories,
      weeks,
      maxWeekExpense,
      currentStreak,
      bestStreak,
      isTwelveMonthView
    };
  }, [
    visibleDays,
    selectedCurrencies,
    displayCurrency,
    exchangeRates,
    startBalances,
    daysInMonth,
    budgetYear,
    budgetMonth,
    isTwelveMonthView,
    filledOverviewMonths,
    monthsByKey,
    activeMonthKey,
    days,
    locale
  ]);

  // ---------- Рендер ----------

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center font-display">
        <button
          type="button"
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between text-left"
          aria-expanded={isExpanded}
        >
          <span className="flex items-center min-w-0">
            <span className="mr-2 flex-shrink-0">🔍</span>
            <span className="truncate">{t('analytics.title')}</span>
          </span>
          <span className="text-xs font-semibold text-gray-500 font-sans flex-shrink-0 ml-3">
            {isExpanded ? t('common.collapse') : t('common.expand')}{' '}
            <span aria-hidden>{isExpanded ? '▲' : '▼'}</span>
          </span>
        </button>
      </h2>

      {isExpanded && (
        <>
          {/* Ряд 1: Ключові метрики */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {/* Середні щоденні витрати */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-orange-400 shadow-md hover:shadow-lg transition-all">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
            {t('analytics.avgDailyExpense')}
          </p>
          <p className="text-base sm:text-xl font-bold text-orange-600 tabular-nums break-words overflow-hidden">
            {displaySymbol}{formatNumber(analytics.avgDailyExpense, 2)}
          </p>
          <p className="text-[10px] text-gray-500">
            {t('analytics.perDay')}
          </p>
        </div>

        {/* Прогнозований баланс */}
        <div className="bg-gradient-to-br from-cyan-50 to-sky-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-cyan-500 shadow-md hover:shadow-lg transition-all">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
            {t('analytics.projectedBalance')}
          </p>
          <p className={`text-base sm:text-xl font-bold tabular-nums break-words overflow-hidden ${
            analytics.projectedEndBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {displaySymbol}{formatNumber(analytics.projectedEndBalance, 2)}
          </p>
          <p className="text-[10px] text-gray-500">
            {t(analytics.isTwelveMonthView ? 'analytics.endOfPeriod' : 'analytics.endOfMonth')}
          </p>
        </div>

        {/* Дні без витрат */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-green-500 shadow-md hover:shadow-lg transition-all">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
            {t('analytics.noSpendDays')}
          </p>
          <p className="text-base sm:text-xl font-bold text-green-600 tabular-nums">
            {analytics.noSpendDayCount}
            <span className="text-sm font-normal text-gray-500">/{analytics.daysInMonth}</span>
          </p>
          <p className="text-[10px] text-gray-500">
            {t('analytics.daysWithoutExpenses')}
          </p>
        </div>

        {/* Рівень заощаджень */}
        <div className="bg-gradient-to-br from-violet-50 to-purple-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-violet-500 shadow-md hover:shadow-lg transition-all">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
            {t('analytics.savingsRate')}
          </p>
          <p className={`text-base sm:text-xl font-bold tabular-nums ${
            analytics.savingsRate >= 0 ? 'text-violet-600' : 'text-rose-600'
          }`}>
            {analytics.savingsRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-500">
            {t('analytics.ofIncome')}
          </p>
        </div>
          </div>

      {/* Ряд 2: Прогрес-бар витрати vs дохід */}
      <div className="bg-gradient-to-br from-slate-50 to-gray-100/70 p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs sm:text-sm font-semibold text-gray-700">
            {t('analytics.spendingVsIncome')}
          </p>
          <p className="text-xs sm:text-sm font-bold text-gray-700 tabular-nums">
            {analytics.spendingProgress.toFixed(1)}%
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 sm:h-5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              analytics.spendingProgress < 50
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : analytics.spendingProgress < 80
                ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                : 'bg-gradient-to-r from-rose-400 to-red-500'
            }`}
            style={{ width: `${Math.min(analytics.spendingProgress, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] sm:text-xs text-gray-500">
            {t('analytics.spent')}: {displaySymbol}{formatNumber(analytics.totalExpenseConverted, 2)}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-500">
            {t('analytics.earned')}: {displaySymbol}{formatNumber(analytics.totalIncomeConverted, 2)}
          </p>
        </div>
      </div>

      {/* Ряд 3: Топ-5 найбільших витрат */}
      {analytics.topExpenses.length > 0 && (
        <div className="bg-gradient-to-br from-rose-50 to-pink-100/70 p-4 rounded-xl border border-rose-200 shadow-sm">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-3 flex items-center">
            <span className="mr-2">🏆</span> {t('analytics.topExpenses')}
          </h3>
          <div className="space-y-2">
            {analytics.topExpenses.map((expense, idx) => {
              // Ширина бар-індикатора пропорційна до найбільшої витрати
              const maxAmount = analytics.topExpenses[0]?.convertedAmount || 1;
              const barWidth = (expense.convertedAmount / maxAmount) * 100;

              return (
                <div key={idx} className="relative">
                  {/* Бар-фон */}
                  <div
                    className="absolute inset-y-0 left-0 bg-rose-200/50 rounded-lg transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative flex items-center justify-between p-2.5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm font-bold text-rose-400 w-5 flex-shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {expense.description}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {analytics.isTwelveMonthView && expense.monthLabel
                            ? `${expense.monthLabel}, ${t('analytics.dayLabel')} ${expense.day}`
                            : `${t('analytics.dayLabel')} ${expense.day}`} • {expense.amount} {expense.currency}
                          {expense.currency !== displayCurrency && (
                            <> <CurrencyFlag currencyCode={expense.currency} size={10} className="inline-block mx-0.5" /></>
                          )}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-rose-600 tabular-nums flex-shrink-0 ml-2">
                      {displaySymbol}{formatNumber(expense.convertedAmount, 2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ряд 4: Витрати за категоріями */}
      {analytics.categories.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-yellow-100/70 p-4 rounded-xl border border-amber-200 shadow-sm mt-4">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-3 flex items-center">
            <span className="mr-2">📦</span> {t('analytics.categoryBreakdown')}
          </h3>

          {/* Кольорова шкала - стекові бар */}
          <div className="w-full h-4 sm:h-5 rounded-full overflow-hidden flex mb-4">
            {analytics.categories.map((cat, idx) => {
              const colors = [
                'bg-amber-500', 'bg-orange-500', 'bg-rose-400', 'bg-violet-500',
                'bg-blue-500', 'bg-emerald-500', 'bg-teal-400', 'bg-pink-400'
              ];
              return (
                <div
                  key={idx}
                  className={`${colors[idx % colors.length]} transition-all duration-500`}
                  style={{ width: `${cat.percentage}%` }}
                  title={`${cat.name === '__other__' ? t('analytics.categoryOther') : cat.name === '—' ? t('analytics.categoryNoDescription') : cat.name}: ${cat.percentage.toFixed(1)}%`}
                />
              );
            })}
          </div>

          {/* Список категорій */}
          <div className="space-y-2">
            {analytics.categories.map((cat, idx) => {
              const colors = [
                'bg-amber-500', 'bg-orange-500', 'bg-rose-400', 'bg-violet-500',
                'bg-blue-500', 'bg-emerald-500', 'bg-teal-400', 'bg-pink-400'
              ];
              const dotColor = colors[idx % colors.length];
              const displayName = cat.name === '__other__'
                ? t('analytics.categoryOther')
                : cat.name === '—'
                ? t('analytics.categoryNoDescription')
                : cat.name;

              return (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dotColor}`} />
                    <span className="text-sm text-gray-800 truncate font-medium">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {cat.count} {t('analytics.categoryTransactions')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-sm font-bold text-gray-800 tabular-nums">
                      {displaySymbol}{formatNumber(cat.totalAmount, 2)}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums w-12 text-right">
                      {cat.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ряд 5: Тижневий розподіл витрат */}
      {analytics.weeks.length > 0 && analytics.totalExpenseConverted > 0 && (
        <div className="bg-gradient-to-br from-sky-50 to-blue-100/70 p-4 rounded-xl border border-sky-200 shadow-sm mt-4">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-3 flex items-center">
            <span className="mr-2">📅</span>{' '}
            {t(analytics.isTwelveMonthView ? 'analytics.monthlyBreakdown' : 'analytics.weeklyBreakdown')}
          </h3>
          <div className="space-y-3">
            {analytics.weeks.map((week, idx) => {
              const barWidth = (week.totalExpense / analytics.maxWeekExpense) * 100;
              const isHighest = week.totalExpense === analytics.maxWeekExpense && week.totalExpense > 0;

              return (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-sky-700">
                        {week.periodLabel
                          || `${t('analytics.weekShort')} ${week.weekNumber}`}
                      </span>
                      {!analytics.isTwelveMonthView && (
                        <span className="text-[10px] text-gray-400">
                          ({t('analytics.dayLabel').toLowerCase()} {week.daysRange})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {week.totalIncome > 0 && (
                        <span className="text-[10px] text-emerald-600 tabular-nums">
                          +{displaySymbol}{formatNumber(week.totalIncome, 0)}
                        </span>
                      )}
                      <span className={`text-xs font-bold tabular-nums ${isHighest ? 'text-rose-600' : 'text-sky-700'}`}>
                        {displaySymbol}{formatNumber(week.totalExpense, 2)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-sky-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${
                        isHighest
                          ? 'bg-gradient-to-r from-rose-400 to-rose-500'
                          : 'bg-gradient-to-r from-sky-400 to-blue-500'
                      }`}
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Середнє за тиждень */}
          <div className="mt-3 pt-3 border-t border-sky-200 flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">
              {t(analytics.isTwelveMonthView ? 'analytics.monthlyAvg' : 'analytics.weeklyAvg')}
            </span>
            <span className="text-sm font-bold text-sky-700 tabular-nums">
              {displaySymbol}{formatNumber(analytics.totalExpenseConverted / (analytics.weeks.length || 1), 2)}
            </span>
          </div>
        </div>
      )}

      {/* Ряд 6: Серія ощадних днів */}
      {analytics.daysWithTransactions > 0 && (
        <div className="bg-gradient-to-br from-lime-50 to-green-100/70 p-4 rounded-xl border border-lime-200 shadow-sm mt-4">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-3 flex items-center">
            <span className="mr-2">🔥</span> {t('analytics.savingsStreak')}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Поточна серія */}
            <div className="bg-white/80 rounded-xl p-3 sm:p-4 border border-lime-200 text-center">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                {t('analytics.streakCurrent')}
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-lime-600 tabular-nums">
                {analytics.currentStreak}
              </p>
              <p className="text-[10px] text-gray-500">
                {t('analytics.streakDays')}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {t('analytics.streakBelowAvg')}
              </p>
            </div>

            {/* Найкраща серія */}
            <div className="bg-white/80 rounded-xl p-3 sm:p-4 border border-lime-200 text-center relative overflow-hidden">
              {analytics.currentStreak > 0 && analytics.currentStreak >= analytics.bestStreak && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-amber-400 text-[8px] sm:text-[10px] text-white font-bold px-2 py-0.5 rounded-bl-lg">
                  {t('analytics.streakNewRecord')}
                </div>
              )}
              <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                {t('analytics.streakBestRecord')}
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 tabular-nums">
                {analytics.bestStreak}
              </p>
              <p className="text-[10px] text-gray-500">
                {t('analytics.streakDays')}
              </p>
              {analytics.currentStreak > 0 && (
                <p className="text-[10px] text-lime-600 font-medium mt-1">
                  {t('analytics.streakKeepGoing')}
                </p>
              )}
            </div>
          </div>

          {/* Візуальна стрічка днів — лише для місячного режиму */}
          {!analytics.isTwelveMonthView && (
          <div className="mt-3 flex flex-wrap gap-1">
            {visibleDays.map((day, idx) => {
              if (!day) return null;
              const transactions = Array.isArray(day.transactions) ? day.transactions : [];
              if (transactions.length === 0) {
                return (
                  <div
                    key={idx}
                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm bg-gray-100 border border-gray-200"
                    title={`${t('analytics.dayLabel')} ${day.day}`}
                  />
                );
              }
              let dayExpenseConverted = 0;
              const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
              selectedCurrencies.forEach((code) => {
                dayExpenseConverted += convertCurrency(amounts[`expense${code}`] || 0, code, displayCurrency, exchangeRates);
              });
              const isBelowAvg = dayExpenseConverted <= analytics.avgDailyExpense;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 sm:w-5 sm:h-5 rounded-sm border transition-all ${
                    isBelowAvg
                      ? 'bg-lime-400 border-lime-500'
                      : 'bg-rose-400 border-rose-500'
                  }`}
                  title={`${t('analytics.dayLabel')} ${day.day}: ${displaySymbol}${formatNumber(dayExpenseConverted, 2)} ${isBelowAvg ? '✅' : '❌'}`}
                />
              );
            })}
          </div>
          )}
          {!analytics.isTwelveMonthView && (
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-lime-400 border border-lime-500 inline-block" /> ≤ {t('analytics.avgDailyExpense').toLowerCase()}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-rose-400 border border-rose-500 inline-block" /> &gt; {t('analytics.avgDailyExpense').toLowerCase()}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200 inline-block" /> —
            </span>
          </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default React.memo(Analytics);

