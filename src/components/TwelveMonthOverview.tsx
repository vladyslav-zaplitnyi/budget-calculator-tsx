import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Budget, ExchangeRates } from '../types';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import { calculateTotals, convertCurrency, formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { getMonthYearLabel } from '../utils/dateHelpers';

interface TwelveMonthOverviewProps {
  activeBudget: Budget | undefined;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  onSelectMonth: (year: number, month: number) => void;
}

export default function TwelveMonthOverview({
  activeBudget,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  onSelectMonth
}: TwelveMonthOverviewProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const symbol = getCurrencySymbol(displayCurrency);

  const windowMonths = useMemo(() => getDefaultOverviewWindow(), []);

  const rows = useMemo(() => {
    const map = activeBudget?.monthsByKey || {};
    return windowMonths.map(({ year, month, key }) => {
      const slice = map[key];
      const days = slice?.days || [];
      const totals = calculateTotals(days, selectedCurrencies);
      let net = 0;
      selectedCurrencies.forEach((code) => {
        const inc = (totals as Record<string, number>)[`totalIncome${code}`] || 0;
        const exp = (totals as Record<string, number>)[`totalExpense${code}`] || 0;
        const diff = inc - exp;
        net += convertCurrency(diff, code, displayCurrency, exchangeRates);
      });
      const label = getMonthYearLabel(locale, year, month);
      return { key, year, month, label, net, hasSlice: !!slice };
    });
  }, [activeBudget?.monthsByKey, windowMonths, selectedCurrencies, displayCurrency, exchangeRates, locale]);

  return (
    <section
      className="rounded-2xl bg-white shadow-md border border-slate-200 p-4 sm:p-6 mb-6"
      aria-label="12-month overview"
    >
      <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-2">
        {i18n.t('budgetView.months', { defaultValue: '12-month overview' })}
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        {i18n.t('budgetView.monthsReadOnlyHint', {
          defaultValue:
            'Read-only. Months run from the current calendar month forward. Click a month to open the daily budget for that month.'
        })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onSelectMonth(row.year, row.month)}
            className="text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 p-4 transition-colors"
          >
            <div className="font-semibold text-slate-800 capitalize">{row.label}</div>
            <div className="text-xs text-slate-500 mt-1">{row.key}</div>
            <div
              className={`mt-3 text-lg font-bold ${
                row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {row.net >= 0 ? '+' : ''}
              {formatNumber(row.net, 2)} {symbol}
            </div>
            {!row.hasSlice && (
              <div className="text-xs text-amber-600 mt-2">
                {i18n.t('budgetView.emptyMonthTap', { defaultValue: 'No data yet — opens empty month' })}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
