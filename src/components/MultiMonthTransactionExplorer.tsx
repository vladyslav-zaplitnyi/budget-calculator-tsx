import React, { ChangeEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExchangeRates, MonthSlice } from '../types';
import {
  filterOverviewTransactions,
  flattenOverviewTransactions,
  OverviewTransaction
} from '../utils/budgetInsights';
import { formatNumber } from '../utils/calculations';
import { capitalizeFirstLetter, formatBudgetTransactionDate, getMonthYearLabel, getWeekdayShortName } from '../utils/dateHelpers';
import { getCurrencySymbol } from '../utils/currencies';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import CurrencyFlag from './CurrencyFlag';

interface MultiMonthTransactionExplorerProps {
  monthsByKey: Record<string, MonthSlice> | undefined;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
}

const MultiMonthTransactionExplorer: React.FC<MultiMonthTransactionExplorerProps> = ({
  monthsByKey,
  selectedCurrencies,
  displayCurrency,
  exchangeRates
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const displaySymbol = getCurrencySymbol(displayCurrency);

  const windowMonths = useMemo(() => getDefaultOverviewWindow(), []);

  const monthOptions = useMemo(
    () =>
      windowMonths.map(({ year, month, key }) => ({
        key,
        label: capitalizeFirstLetter(getMonthYearLabel(locale, year, month))
      })),
    [windowMonths, locale]
  );

  const transactions = useMemo(
    () =>
      flattenOverviewTransactions({
        monthsByKey,
        windowMonths,
        displayCurrency,
        exchangeRates
      }),
    [monthsByKey, windowMonths, displayCurrency, exchangeRates]
  );

  const filteredTransactions = useMemo(
    () =>
      filterOverviewTransactions(transactions, {
        search,
        type: typeFilter,
        currency: currencyFilter,
        month: monthFilter,
        day: dayFilter === 'all' ? 'all' : Number(dayFilter)
      }),
    [transactions, search, typeFilter, currencyFilter, monthFilter, dayFilter]
  );

  const dayOptions = useMemo(
    () =>
      Array.from(new Set(transactions.map((transaction) => transaction.day))).sort(
        (a, b) => a - b
      ),
    [transactions]
  );

  const filteredTotals = useMemo(() => {
    return filteredTransactions.reduce(
      (totals, transaction) => {
        if (transaction.type === 'income') {
          totals.income += transaction.convertedAmount;
        } else {
          totals.expense += transaction.convertedAmount;
        }
        return totals;
      },
      { income: 0, expense: 0 }
    );
  }, [filteredTransactions]);

  const groupedByMonth = useMemo(() => {
    const byKey = new Map<string, OverviewTransaction[]>();
    filteredTransactions.forEach((transaction) => {
      const list = byKey.get(transaction.monthKey) || [];
      list.push(transaction);
      byKey.set(transaction.monthKey, list);
    });

    return windowMonths
      .map(({ year, month, key }) => {
        const monthTransactions = byKey.get(key);
        if (!monthTransactions?.length) return null;

        let income = 0;
        let expense = 0;
        monthTransactions.forEach((transaction) => {
          if (transaction.type === 'income') {
            income += transaction.convertedAmount;
          } else {
            expense += transaction.convertedAmount;
          }
        });

        return {
          key,
          label: capitalizeFirstLetter(getMonthYearLabel(locale, year, month)),
          transactions: monthTransactions,
          income,
          expense
        };
      })
      .filter((group): group is NonNullable<typeof group> => group !== null);
  }, [filteredTransactions, windowMonths, locale]);

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(event.target.value as 'all' | 'income' | 'expense');
  };

  const renderTransaction = (transaction: OverviewTransaction) => {
    const isIncome = transaction.type === 'income';
    const amountClass = isIncome ? 'text-emerald-600' : 'text-rose-600';
    const sign = isIncome ? '+' : '-';
    const weekday = getWeekdayShortName(
      transaction.year,
      transaction.month,
      transaction.day,
      locale
    );
    const dayDateLabel = formatBudgetTransactionDate(
      locale,
      transaction.year,
      transaction.month,
      transaction.day
    );

    return (
      <div
        key={`${transaction.monthKey}-${transaction.day}-${transaction.id}`}
        className="grid grid-cols-1 md:grid-cols-[90px_1fr_150px_160px] gap-2 md:gap-4 items-center rounded-xl bg-white border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all"
      >
        <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0">
          <span className="text-xs font-semibold text-gray-500">
            {t('transactionExplorer.dayLabel')}
          </span>
          <span className="text-base font-extrabold text-indigo-700 tabular-nums">
            {transaction.day}
          </span>
          <span className="text-[11px] text-gray-400">{weekday}</span>
          <span className="text-[11px] text-gray-500 md:hidden">{dayDateLabel}</span>
        </div>

        <div className="min-w-0">
          <p className="font-bold text-gray-800 truncate">{transaction.description}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isIncome ? t('transactionExplorer.income') : t('transactionExplorer.expense')}
          </p>
        </div>

        <div className="flex items-center gap-2 md:justify-end">
          <CurrencyFlag currencyCode={transaction.currency} size={16} />
          <span className={`font-bold tabular-nums ${amountClass}`}>
            {sign}{formatNumber(transaction.amount, 2)} {transaction.currency}
          </span>
        </div>

        <div className="md:text-right">
          <p className={`text-sm font-extrabold tabular-nums ${amountClass}`}>
            {sign}{displaySymbol}{formatNumber(transaction.convertedAmount, 2)}
          </p>
          {transaction.currency !== displayCurrency && (
            <p className="text-[11px] text-gray-400">
              {t('transactionExplorer.convertedTo', { currency: displayCurrency })}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100 mb-4 sm:mb-6">
      <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${isExpanded ? 'mb-4' : ''}`}>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 font-display">
            {t('multiMonthTransactionExplorer.title')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('multiMonthTransactionExplorer.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 font-semibold">{t('statistics.income')}</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">
              {displaySymbol}{formatNumber(filteredTotals.income, 0)}
            </p>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 font-semibold">{t('statistics.expenses')}</p>
            <p className="text-sm font-bold text-rose-600 tabular-nums">
              {displaySymbol}{formatNumber(filteredTotals.expense, 0)}
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 font-semibold">{t('transactionExplorer.matches')}</p>
            <p className="text-sm font-bold text-indigo-600 tabular-nums">
              {filteredTransactions.length}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="px-4 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transition-all"
        >
          {isExpanded ? t('common.collapse') : t('common.expand')}{' '}
          <span aria-hidden>{isExpanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {isExpanded && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            <label className="block sm:col-span-2 xl:col-span-1">
              <span className="block text-xs font-semibold text-gray-600 mb-1">
                {t('transactionExplorer.search')}
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('multiMonthTransactionExplorer.searchPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">
                {t('transactionExplorer.type')}
              </span>
              <select
                value={typeFilter}
                onChange={handleTypeChange}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">{t('transactionExplorer.allTypes')}</option>
                <option value="income">{t('transactionExplorer.income')}</option>
                <option value="expense">{t('transactionExplorer.expense')}</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">
                {t('transactionExplorer.currency')}
              </span>
              <select
                value={currencyFilter}
                onChange={(event) => setCurrencyFilter(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">{t('transactionExplorer.allCurrencies')}</option>
                {selectedCurrencies.map((currencyCode) => (
                  <option key={currencyCode} value={currencyCode}>
                    {currencyCode}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">
                {t('multiMonthTransactionExplorer.month')}
              </span>
              <select
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">{t('multiMonthTransactionExplorer.allMonths')}</option>
                {monthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">
                {t('transactionExplorer.day')}
              </span>
              <select
                value={dayFilter}
                onChange={(event) => setDayFilter(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">{t('transactionExplorer.allDays')}</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredTransactions.length > 0 ? (
            <div className="space-y-4">
              {groupedByMonth.map((group) => (
                <section
                  key={group.key}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                    <div>
                      <h3 className="font-bold text-slate-800">{group.label}</h3>
                      <p className="text-xs text-slate-500 tabular-nums mt-0.5">{group.key}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-700">
                        {t('multiMonthTransactionExplorer.monthMatches', {
                          count: group.transactions.length
                        })}
                      </span>
                      {group.income > 0 && (
                        <span className="tabular-nums font-semibold text-emerald-700">
                          +{displaySymbol}{formatNumber(group.income, 0)}
                        </span>
                      )}
                      {group.expense > 0 && (
                        <span className="tabular-nums font-semibold text-rose-700">
                          −{displaySymbol}{formatNumber(group.expense, 0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {group.transactions.map(renderTransaction)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="font-bold text-gray-700">{t('transactionExplorer.emptyTitle')}</p>
              <p className="text-sm text-gray-500 mt-1">
                {t('multiMonthTransactionExplorer.emptyDescription')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(MultiMonthTransactionExplorer);
