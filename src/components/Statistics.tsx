import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency, formatNumber, Totals } from '../utils/calculations';
import { getCurrencyInfo, getCurrencySymbol } from '../utils/currencies';
import { ExchangeRates, Day } from '../types';
import CurrencyFlag from './CurrencyFlag';

interface StatisticsProps {
  isUk: boolean;
  totals: Totals;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  days?: Day[];
  budgetYear?: number;
  budgetMonth?: number;
}

const Statistics: React.FC<StatisticsProps> = ({
  isUk,
  totals = {},
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {},
  days = [],
  budgetYear,
  budgetMonth
}) => {
  const { t } = useTranslation();
  const displayInfo = getCurrencyInfo(displayCurrency);
  const displaySymbol = displayInfo ? displayInfo.symbol : displayCurrency;

  // Конвертуємо всі суми в обраній валюті відображення
  let totalIncomeConverted = 0;
  let totalExpenseConverted = 0;
  
  selectedCurrencies.forEach(currencyCode => {
    const incomeKey = `totalIncome${currencyCode}`;
    const expenseKey = `totalExpense${currencyCode}`;
    const income = totals[incomeKey] || 0;
    const expense = totals[expenseKey] || 0;
    
    totalIncomeConverted += convertCurrency(income, currencyCode, displayCurrency, exchangeRates);
    totalExpenseConverted += convertCurrency(expense, currencyCode, displayCurrency, exchangeRates);
  });

  // Insights: обчислюємо корисну статистику
  const insights = useMemo(() => {
    const daysWithTransactions = days.filter(d => 
      d && Array.isArray(d.transactions) && d.transactions.length > 0
    ).length;

    const totalDays = days.length;

    // Знаходимо найбільшу витрату та дохід
    let topExpense: { amount: number; description: string; currency: string } | null = null;
    let topIncome: { amount: number; description: string; currency: string } | null = null;

    days.forEach(day => {
      if (!day || !Array.isArray(day.transactions)) return;
      day.transactions.forEach(tx => {
        const amount = parseFloat(String(tx.amount)) || 0;
        if (tx.type === 'expense') {
          const converted = convertCurrency(amount, tx.currency, displayCurrency, exchangeRates);
          if (!topExpense || converted > convertCurrency(topExpense.amount, topExpense.currency, displayCurrency, exchangeRates)) {
            topExpense = { amount, description: tx.description, currency: tx.currency };
          }
        } else if (tx.type === 'income') {
          const converted = convertCurrency(amount, tx.currency, displayCurrency, exchangeRates);
          if (!topIncome || converted > convertCurrency(topIncome.amount, topIncome.currency, displayCurrency, exchangeRates)) {
            topIncome = { amount, description: tx.description, currency: tx.currency };
          }
        }
      });
    });

    const avgDailyExpense = daysWithTransactions > 0 
      ? totalExpenseConverted / daysWithTransactions 
      : 0;
    const avgDailyIncome = daysWithTransactions > 0 
      ? totalIncomeConverted / daysWithTransactions 
      : 0;

    return {
      daysWithTransactions,
      totalDays,
      avgDailyExpense,
      avgDailyIncome,
      topExpense: topExpense as { amount: number; description: string; currency: string } | null,
      topIncome: topIncome as { amount: number; description: string; currency: string } | null
    };
  }, [days, totalExpenseConverted, totalIncomeConverted, displayCurrency, exchangeRates]);

  // Обчислюємо максимальне значення для бар-чарту
  const maxBarValue = Math.max(totalIncomeConverted, totalExpenseConverted, 1);
  const incomeBarWidth = (totalIncomeConverted / maxBarValue) * 100;
  const expenseBarWidth = (totalExpenseConverted / maxBarValue) * 100;

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center font-display">
        <span className="mr-2">📈</span>{' '}
        {t('statistics.title')}
      </h2>

      {/* ===== Visual Bar Chart: Income vs Expenses ===== */}
      <div className="mb-6 bg-gradient-to-br from-slate-50 to-indigo-50/50 p-4 rounded-xl border border-slate-200">
        {/* Income bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-emerald-700 flex items-center gap-1">
              ✅ {t('statistics.income')}
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-700 tabular-nums">
              {displaySymbol}{formatNumber(totalIncomeConverted, 2)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 sm:h-5 overflow-hidden shadow-inner">
            <div 
              className="stat-bar h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full flex items-center justify-end pr-2 shadow-sm"
              style={{ width: `${Math.max(incomeBarWidth, 0.5)}%` }}
            >
              {incomeBarWidth > 15 && (
                <span className="text-[10px] font-bold text-white drop-shadow-sm">{Math.round(incomeBarWidth)}%</span>
              )}
            </div>
          </div>
        </div>
        {/* Expense bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-semibold text-rose-700 flex items-center gap-1">
              ❌ {t('statistics.expenses')}
            </span>
            <span className="text-xs sm:text-sm font-bold text-rose-700 tabular-nums">
              {displaySymbol}{formatNumber(totalExpenseConverted, 2)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 sm:h-5 overflow-hidden shadow-inner">
            <div 
              className="stat-bar h-full bg-gradient-to-r from-rose-400 to-rose-500 rounded-full flex items-center justify-end pr-2 shadow-sm"
              style={{ width: `${Math.max(expenseBarWidth, 0.5)}%` }}
            >
              {expenseBarWidth > 15 && (
                <span className="text-[10px] font-bold text-white drop-shadow-sm">{Math.round(expenseBarWidth)}%</span>
              )}
            </div>
          </div>
        </div>
        {/* Net result */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-semibold text-gray-600">
            {t('statistics.difference')} ({displayCurrency})
          </span>
          <span className={`text-sm sm:text-lg font-bold tabular-nums ${
            (totalIncomeConverted - totalExpenseConverted) >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {(totalIncomeConverted - totalExpenseConverted) >= 0 ? '+' : ''}{displaySymbol}{formatNumber(totalIncomeConverted - totalExpenseConverted, 2)}
          </span>
        </div>
      </div>

      {/* ===== Insights Grid ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {/* Days with transactions */}
        <div className="insight-card bg-gradient-to-br from-violet-50 to-indigo-100/70 p-3 rounded-xl border border-violet-200 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">{t('statistics.daysWithTransactions')}</p>
          <p className="text-xl sm:text-2xl font-bold text-indigo-700 tabular-nums">
            {insights.daysWithTransactions}
            <span className="text-xs sm:text-sm font-normal text-gray-500 ml-1">
              / {insights.totalDays}
            </span>
          </p>
        </div>

        {/* Avg daily expense */}
        <div className="insight-card bg-gradient-to-br from-rose-50 to-red-100/70 p-3 rounded-xl border border-rose-200 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">{t('statistics.avgDailyExpense')}</p>
          <p className="text-lg sm:text-xl font-bold text-rose-600 tabular-nums break-words">
            {displaySymbol}{formatNumber(insights.avgDailyExpense, 2)}
          </p>
        </div>

        {/* Avg daily income */}
        <div className="insight-card bg-gradient-to-br from-emerald-50 to-green-100/70 p-3 rounded-xl border border-emerald-200 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">{t('statistics.avgDailyIncome')}</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums break-words">
            {displaySymbol}{formatNumber(insights.avgDailyIncome, 2)}
          </p>
        </div>

        {/* Top expense */}
        <div className="insight-card bg-gradient-to-br from-amber-50 to-yellow-100/70 p-3 rounded-xl border border-amber-200 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">{t('statistics.topExpense')}</p>
          {insights.topExpense ? (
            <>
              <p className="text-lg sm:text-xl font-bold text-amber-700 tabular-nums break-words">
                {getCurrencySymbol(insights.topExpense.currency)}{formatNumber(insights.topExpense.amount, 2)}
              </p>
              <p className="text-[10px] text-gray-500 truncate mt-0.5">{insights.topExpense.description}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{t('statistics.noTransactions')}</p>
          )}
        </div>
      </div>

      {/* Income and Expenses Grid - показуємо для кожної обраної валюти */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4">
        {selectedCurrencies.map((currencyCode) => {
          const currency = getCurrencyInfo(currencyCode);
          if (!currency) return null;
          
          const incomeKey = `totalIncome${currencyCode}`;
          const expenseKey = `totalExpense${currencyCode}`;
          const totalIncome = totals[incomeKey] || 0;
          const totalExpense = totals[expenseKey] || 0;
          const symbol = getCurrencySymbol(currencyCode);
          
          return (
            <React.Fragment key={currencyCode}>
              {/* Income */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-emerald-500 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-600 font-sans">
                    {t('statistics.income')}
                  </p>
                  <CurrencyFlag currencyCode={currencyCode} size={14} />
                </div>
                <p className="text-base sm:text-xl font-bold text-emerald-600 font-sans break-words overflow-hidden">
                  {symbol}{formatNumber(totalIncome, 2)}
                </p>
                <p className="text-[10px] text-gray-500 font-sans">{currencyCode}</p>
              </div>

              {/* Expenses */}
              <div className="bg-gradient-to-br from-rose-50 to-red-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-rose-500 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-600 font-sans">
                    {t('statistics.expenses')}
                  </p>
                  <CurrencyFlag currencyCode={currencyCode} size={14} />
                </div>
                <p className="text-base sm:text-xl font-bold text-rose-600 font-sans break-words overflow-hidden">
                  {symbol}{formatNumber(totalExpense, 2)}
                </p>
                <p className="text-[10px] text-gray-500 font-sans">{currencyCode}</p>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Net Differences - для кожної валюти */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
        {selectedCurrencies.map((currencyCode) => {
          const currency = getCurrencyInfo(currencyCode);
          if (!currency) return null;
          
          const incomeKey = `totalIncome${currencyCode}`;
          const expenseKey = `totalExpense${currencyCode}`;
          const totalIncome = totals[incomeKey] || 0;
          const totalExpense = totals[expenseKey] || 0;
          const difference = totalIncome - totalExpense;
          const symbol = getCurrencySymbol(currencyCode);
          
          return (
            <div key={currencyCode} className="bg-gradient-to-br from-indigo-50 to-violet-100/70 p-4 rounded-xl border-2 border-indigo-200 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-700 font-sans">
                  {t('statistics.difference')} {currencyCode} <CurrencyFlag currencyCode={currencyCode} size={14} className="ml-1" />
                </p>
              </div>
              <p className={`text-xl sm:text-2xl font-bold font-sans break-words overflow-hidden ${
                difference >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {difference >= 0 ? '+' : ''}{symbol}{formatNumber(difference, 2)}
              </p>
              <p className="text-xs text-gray-500 mt-1 font-sans">
                {t('statistics.incomeMinusExpenses')}
              </p>
            </div>
          );
        })}
      </div>

      {/* Total in Display Currency */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-100/70 p-4 rounded-xl border-2 border-indigo-300 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-gray-700 font-sans">
              {t('statistics.totalDifference')} {displayCurrency} <CurrencyFlag currencyCode={displayCurrency} size={14} className="ml-1" />
            </p>
          </div>
          <p className={`text-xl sm:text-2xl font-bold font-sans break-words overflow-hidden ${
            (totalIncomeConverted - totalExpenseConverted) >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {(totalIncomeConverted - totalExpenseConverted) >= 0 ? '+' : ''}{displaySymbol}{formatNumber(totalIncomeConverted - totalExpenseConverted, 2)}
          </p>
          <p className="text-xs text-gray-500 mt-1 font-sans">
            {t('statistics.incomeMinusExpensesConverted')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Statistics);
