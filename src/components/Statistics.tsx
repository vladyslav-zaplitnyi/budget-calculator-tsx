import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { convertCurrency, formatNumber, Totals } from '../utils/calculations';
import { getCurrencyInfo, getCurrencySymbol } from '../utils/currencies';
import { ExchangeRates } from '../types';
import CurrencyFlag from './CurrencyFlag';
import InfoTip from './InfoTip';

interface StatisticsProps {
  isUk?: boolean;
  totals: Totals;
  remainingBalances?: Record<string, number>;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
}

const Statistics: React.FC<StatisticsProps> = ({
  totals = {},
  remainingBalances = {},
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {}
}) => {
  const { t } = useTranslation();
  const displayInfo = getCurrencyInfo(displayCurrency);
  const displaySymbol = displayInfo ? displayInfo.symbol : displayCurrency;

  const statisticsExpandedStorageKey = 'budget_statistics_expanded';
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true;
      const stored = window.localStorage.getItem(statisticsExpandedStorageKey);
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
          window.localStorage.setItem(statisticsExpandedStorageKey, String(next));
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  let totalRemainingConverted = 0;
  selectedCurrencies.forEach((currencyCode) => {
    const remaining = remainingBalances[`finalBalance${currencyCode}`] || 0;
    totalRemainingConverted += convertCurrency(
      remaining,
      currencyCode,
      displayCurrency,
      exchangeRates
    );
  });

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="flex-1 text-lg sm:text-xl font-bold text-gray-800 font-display min-w-0">
          <button
            type="button"
            onClick={toggleExpanded}
            className="w-full flex items-center justify-between text-left min-w-0"
            aria-expanded={isExpanded}
          >
            <span className="flex items-center min-w-0">
              <span className="mr-2 flex-shrink-0">📈</span>{' '}
              <span className="truncate">{t('statistics.title')}</span>
            </span>
            <span className="text-xs font-semibold text-gray-500 font-sans flex-shrink-0 ml-3">
              {isExpanded ? t('common.collapse') : t('common.expand')}{' '}
              <span aria-hidden>{isExpanded ? '▲' : '▼'}</span>
            </span>
          </button>
        </h2>
        <InfoTip text={t('infoTips.statistics')} />
      </div>

      {isExpanded && (
        <>
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
                  <div className="bg-gradient-to-br from-emerald-50 to-green-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-emerald-500 shadow-md hover:shadow-lg transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-600 font-sans flex items-center gap-1 min-w-0">
                        {t('statistics.income')}
                        <InfoTip text={t('infoTips.statisticsIncome')} />
                      </p>
                      <CurrencyFlag currencyCode={currencyCode} size={14} />
                    </div>
                    <p className="text-base sm:text-xl font-bold text-emerald-600 font-sans break-words overflow-hidden">
                      {symbol}{formatNumber(totalIncome, 2)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-sans">{currencyCode}</p>
                  </div>

                  <div className="bg-gradient-to-br from-rose-50 to-red-100/70 p-3 sm:p-4 rounded-xl border-l-4 border-rose-500 shadow-md hover:shadow-lg transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-600 font-sans flex items-center gap-1 min-w-0">
                        {t('statistics.expenses')}
                        <InfoTip text={t('infoTips.statisticsExpenses')} />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
            {selectedCurrencies.map((currencyCode) => {
              const currency = getCurrencyInfo(currencyCode);
              if (!currency) return null;

              const remaining = remainingBalances[`finalBalance${currencyCode}`] || 0;
              const symbol = getCurrencySymbol(currencyCode);

              return (
                <div key={currencyCode} className="bg-gradient-to-br from-cyan-50 to-sky-100/70 p-4 rounded-xl border-2 border-cyan-200 shadow-lg hover:shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs sm:text-sm font-semibold text-gray-700 font-sans flex items-center gap-1 min-w-0">
                      {t('statistics.remaining')} {currencyCode} <CurrencyFlag currencyCode={currencyCode} size={14} className="ml-1" />
                      <InfoTip text={t('infoTips.statisticsRemaining')} />
                    </p>
                  </div>
                  <p className={`text-xl sm:text-2xl font-bold font-sans break-words overflow-hidden ${
                    remaining >= 0 ? 'text-cyan-700' : 'text-rose-600'
                  }`}>
                    {symbol}{formatNumber(remaining, 2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 font-sans">
                    {t('statistics.leftInThisCurrency')}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-cyan-50 to-sky-100/70 p-4 rounded-xl border-2 border-cyan-300 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-700 font-sans flex items-center gap-1 min-w-0">
                  {t('statistics.totalRemaining')}
                  <CurrencyFlag currencyCode={displayCurrency} size={14} className="ml-1" />
                  <InfoTip text={t('infoTips.statisticsTotalRemaining')} />
                </p>
              </div>
              <p className={`text-xl sm:text-2xl font-bold font-sans break-words overflow-hidden ${
                totalRemainingConverted >= 0 ? 'text-cyan-700' : 'text-rose-600'
              }`}>
                {displaySymbol}{formatNumber(totalRemainingConverted, 2)}
              </p>
              <p className="text-xs text-gray-500 mt-1 font-sans">
                {t('statistics.totalRemainingHelper', { currency: displayCurrency })}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(Statistics);
