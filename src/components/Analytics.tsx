import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency, formatNumber, calculateDayAmountsFromTransactions } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { getDaysInMonth } from '../utils/dateHelpers';
import { Day, ExchangeRates, Transaction } from '../types';
import CurrencyFlag from './CurrencyFlag';

interface AnalyticsProps {
  days: Day[];
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  startBalances: Record<string, number | null>;
  budgetYear: number;
  budgetMonth: number;
}

interface TopExpense {
  description: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  day: number;
}

const Analytics: React.FC<AnalyticsProps> = ({
  days,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startBalances,
  budgetYear,
  budgetMonth
}) => {
  const { t } = useTranslation();
  const displaySymbol = getCurrencySymbol(displayCurrency);
  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);
  const visibleDays = days.slice(0, daysInMonth);

  // ---------- Обчислення аналітичних даних ----------

  const analytics = useMemo(() => {
    let totalIncomeConverted = 0;
    let totalExpenseConverted = 0;
    let noSpendDayCount = 0;
    let daysWithTransactions = 0;
    const allExpenses: TopExpense[] = [];

    visibleDays.forEach((day) => {
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
            day: day.day
          });
        }
      });

      if (transactions.length > 0) {
        daysWithTransactions++;
      }

      if (!dayHasExpense) {
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

    // Прогнозована загальна витрата до кінця місяця
    const projectedTotalExpense = avgDailyExpense * daysInMonth;

    // Прогнозований баланс на кінець місяця
    let totalStartBalance = 0;
    selectedCurrencies.forEach((code) => {
      const balance = parseFloat(String(startBalances[code])) || 0;
      totalStartBalance += convertCurrency(balance, code, displayCurrency, exchangeRates);
    });
    const projectedEndBalance =
      totalStartBalance + totalIncomeConverted - projectedTotalExpense;

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
      daysInMonth
    };
  }, [visibleDays, selectedCurrencies, displayCurrency, exchangeRates, startBalances, daysInMonth]);

  // ---------- Рендер ----------

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 mt-4 sm:mt-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center font-display">
        <span className="mr-2">🔍</span> {t('analytics.title')}
      </h2>

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
            {t('analytics.endOfMonth')}
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
                          {t('analytics.dayLabel')} {expense.day} • {expense.amount} {expense.currency}
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
    </div>
  );
};

export default React.memo(Analytics);

