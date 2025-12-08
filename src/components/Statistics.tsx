import React from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency } from '../utils/calculations';
import { getCurrencyInfo, getCurrencySymbol } from '../utils/currencies';
import { ExchangeRates } from '../types';
import CurrencyFlag from './CurrencyFlag';

interface StatisticsProps {
  isUk: boolean;
  totals: Record<string, number>;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
}

const Statistics: React.FC<StatisticsProps> = ({
  isUk,
  totals = {},
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {}
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
  
  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📈</span>{' '}
        {t('statistics.title')}
      </h2>

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
              <div className="bg-gradient-to-br from-emerald-50 to-green-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-emerald-500 shadow-md hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-600">
                    {t('statistics.income')}
                  </p>
                  <CurrencyFlag currencyCode={currencyCode} size={14} />
                </div>
                <p className="text-base sm:text-xl font-bold text-emerald-600">
                  {symbol}{totalIncome.toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-500">{currencyCode}</p>
              </div>

              {/* Expenses */}
              <div className="bg-gradient-to-br from-rose-50 to-red-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-rose-500 shadow-md hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-600">
                    {t('statistics.expenses')}
                  </p>
                  <CurrencyFlag currencyCode={currencyCode} size={14} />
                </div>
                <p className="text-base sm:text-xl font-bold text-rose-600">
                  {symbol}{totalExpense.toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-500">{currencyCode}</p>
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
            <div key={currencyCode} className="bg-gradient-to-br from-indigo-50 to-violet-100/70 p-4 rounded-xl border-2 border-indigo-200 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-700">
                  {t('statistics.difference')} {currencyCode} <CurrencyFlag currencyCode={currencyCode} size={14} className="ml-1" />
                </p>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${
                difference >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {symbol}{difference.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
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
            <p className="text-xs sm:text-sm font-semibold text-gray-700">
              {t('statistics.totalDifference')} {displayCurrency} <CurrencyFlag currencyCode={displayCurrency} size={14} className="ml-1" />
            </p>
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${
            (totalIncomeConverted - totalExpenseConverted) >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            {displaySymbol}{(totalIncomeConverted - totalExpenseConverted).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('statistics.incomeMinusExpensesConverted')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Statistics);

