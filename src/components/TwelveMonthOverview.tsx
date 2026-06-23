import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Budget, ExchangeRates } from '../types';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import { calculateTotals, convertCurrency, formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';

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
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const symbol = getCurrencySymbol(displayCurrency);

  const windowMonths = useMemo(() => getDefaultOverviewWindow(), []);

  const rows = useMemo(() => {
    const map = activeBudget?.monthsByKey || {};
    return windowMonths.map(({ year, month, key }) => {
      const slice = map[key];
      const days = slice?.days || [];
      const totals = calculateTotals(days, selectedCurrencies);

      let income = 0;
      let expense = 0;
      selectedCurrencies.forEach((code) => {
        const inc = (totals as Record<string, number>)[`totalIncome${code}`] || 0;
        const exp = (totals as Record<string, number>)[`totalExpense${code}`] || 0;
        income += convertCurrency(inc, code, displayCurrency, exchangeRates);
        expense += convertCurrency(exp, code, displayCurrency, exchangeRates);
      });

      const net = income - expense;
      const label = capitalizeFirstLetter(getMonthYearLabel(locale, year, month));
      const txCount = days.reduce(
        (sum, d) => sum + (Array.isArray(d.transactions) ? d.transactions.length : 0),
        0
      );

      return { key, year, month, label, income, expense, net, hasSlice: !!slice, txCount };
    });
  }, [activeBudget?.monthsByKey, windowMonths, selectedCurrencies, displayCurrency, exchangeRates, locale]);

  return (
    <section
      className="rounded-2xl bg-white shadow-md border border-slate-200 p-4 sm:p-6 mb-6"
      aria-label={t('budgetView.months')}
    >
      <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-1">
        {t('budgetView.months')}
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        {t('budgetView.monthsReadOnlyHint')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onSelectMonth(row.year, row.month)}
            className="text-left rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-slate-800 capitalize">{row.label}</div>
              {row.txCount > 0 && (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                  {row.txCount}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 tabular-nums">{row.key}</div>

            <div className="mt-3 space-y-1 text-sm tabular-nums">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('monthlyPlanner.income')}</span>
                <span className={row.income > 0 ? 'font-semibold text-emerald-700' : 'text-slate-400'}>
                  {row.income > 0 ? `+${symbol}${formatNumber(row.income, 2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{t('monthlyPlanner.expense')}</span>
                <span className={row.expense > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'}>
                  {row.expense > 0 ? `−${symbol}${formatNumber(row.expense, 2)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 pt-1 border-t border-slate-200">
                <span className="font-medium text-slate-600">{t('monthlyPlanner.net')}</span>
                <span
                  className={`font-bold ${
                    row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {row.net >= 0 ? '+' : ''}
                  {symbol}
                  {formatNumber(row.net, 2)}
                </span>
              </div>
            </div>

            {!row.hasSlice && (
              <div className="text-xs text-amber-600 mt-2">
                {t('budgetView.emptyMonthTap')}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
