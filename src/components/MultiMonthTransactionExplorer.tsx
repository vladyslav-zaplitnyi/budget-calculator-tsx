import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Day, ExchangeRates, MonthSlice } from '../types';
import {
  filterOverviewTransactions,
  flattenOverviewTransactions,
  OverviewTransaction
} from '../utils/budgetInsights';
import { formatNumber } from '../utils/calculations';
import { capitalizeFirstLetter, formatBudgetTransactionDate, getMonthYearLabel, getWeekdayShortName } from '../utils/dateHelpers';
import { getCurrencySymbol } from '../utils/currencies';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import { getCategoryEmoji, getCategoryLabel } from '../utils/categories';
import {
  amountsMatchAcross,
  collectTransactionsAcrossMonths,
  descriptionGroupKey,
  groupOverviewTransactionsByDescription
} from '../utils/multiMonthTransactionEdits';
import { useTransactionMoveSelection } from '../hooks/useTransactionMoveSelection';
import type { TransactionEditPatch } from '../utils/moveTransactions';
import CurrencyFlag from './CurrencyFlag';
import InfoTip from './InfoTip';
import SelectableTransactionRow from './SelectableTransactionRow';
import BulkEditTransactionsModal from './BulkEditTransactionsModal';
import ConfirmModal from './ConfirmModal';

interface MultiMonthTransactionExplorerProps {
  monthsByKey: Record<string, MonthSlice> | undefined;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  activeMonthKey?: string;
  activeDays?: Day[];
  readOnly?: boolean;
  onEditTransactions?: (patches: TransactionEditPatch[]) => void;
  onDeleteTransactions?: (transactionIds: string[]) => void;
}

type GroupBy = 'description' | 'month';

const MultiMonthTransactionExplorer: React.FC<MultiMonthTransactionExplorerProps> = ({
  monthsByKey,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  activeMonthKey,
  activeDays,
  readOnly = false,
  onEditTransactions,
  onDeleteTransactions
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const language = locale === 'uk' ? 'uk' : 'en';
  const canEdit = !readOnly && Boolean(onEditTransactions || onDeleteTransactions);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('description');
  const [repeatsOnly, setRepeatsOnly] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(() => new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editItems, setEditItems] = useState<ReturnType<typeof collectTransactionsAcrossMonths>>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const displaySymbol = getCurrencySymbol(displayCurrency);
  const {
    selectedList,
    isSelecting,
    isSelected,
    toggleId,
    addIds,
    removeIds,
    bindItem,
    consumeSuppressedClick,
    clearSelection,
    pruneToExistingIds
  } = useTransactionMoveSelection(canEdit);

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
        exchangeRates,
        activeMonthKey,
        activeDays
      }),
    [monthsByKey, windowMonths, displayCurrency, exchangeRates, activeMonthKey, activeDays]
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

  const displayedTransactions = useMemo(() => {
    if (!repeatsOnly) return filteredTransactions;
    const counts = new Map<string, number>();
    filteredTransactions.forEach((transaction) => {
      const key = descriptionGroupKey(transaction.description);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return filteredTransactions.filter((transaction) => {
      return (counts.get(descriptionGroupKey(transaction.description)) || 0) > 1;
    });
  }, [filteredTransactions, repeatsOnly]);

  const dayOptions = useMemo(
    () =>
      Array.from(new Set(transactions.map((transaction) => transaction.day))).sort(
        (a, b) => a - b
      ),
    [transactions]
  );

  const filteredTotals = useMemo(() => {
    return displayedTransactions.reduce(
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
  }, [displayedTransactions]);

  const groupedByMonth = useMemo(() => {
    const byKey = new Map<string, OverviewTransaction[]>();
    displayedTransactions.forEach((transaction) => {
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
  }, [displayedTransactions, windowMonths, locale]);

  const groupedByDescription = useMemo(
    () => groupOverviewTransactionsByDescription(displayedTransactions, locale),
    [displayedTransactions, locale]
  );

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    transactions.forEach((transaction) => {
      if (transaction.id) ids.add(transaction.id);
    });
    return ids;
  }, [transactions]);

  useEffect(() => {
    pruneToExistingIds(existingIds);
  }, [existingIds, pruneToExistingIds]);

  const visibleIds = useMemo(
    () => displayedTransactions.map((transaction) => transaction.id).filter(Boolean),
    [displayedTransactions]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => isSelected(id));

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(event.target.value as 'all' | 'income' | 'expense');
  };

  const toggleGroupOpen = (key: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isGroupOpen = (key: string) => expandedGroupKeys.has(key);

  const toggleGroupSelection = (ids: string[]) => {
    if (ids.length === 0) return;
    const allSelected = ids.every((id) => isSelected(id));
    if (allSelected) removeIds(ids);
    else addIds(ids);
  };

  const openEdit = () => {
    if (!onEditTransactions || selectedList.length === 0) return;
    setEditItems(
      collectTransactionsAcrossMonths(
        monthsByKey,
        selectedList,
        activeMonthKey,
        activeDays
      )
    );
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditItems([]);
  };

  const saveEdits = (patches: TransactionEditPatch[]) => {
    onEditTransactions?.(patches);
    clearSelection();
    closeEdit();
  };

  const confirmDelete = () => {
    onDeleteTransactions?.(selectedList);
    setDeleteConfirmOpen(false);
    clearSelection();
  };

  const groupTitle = (name: string) => name || t('multiMonthTransactionExplorer.unnamed');

  const renderGroupSelectButton = (ids: string[], label: string) => {
    const selectedCount = ids.filter((id) => isSelected(id)).length;
    const all = ids.length > 0 && selectedCount === ids.length;
    const some = selectedCount > 0 && !all;
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (!canEdit) return;
          toggleGroupSelection(ids);
        }}
        className={`flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors w-5 h-5 ${
          all
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : some
              ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
              : 'bg-white border-gray-300 hover:border-indigo-400'
        }`}
        aria-label={label}
        aria-pressed={all}
        disabled={!canEdit}
      >
        {all ? (
          <span className="text-[11px] leading-none" aria-hidden>✓</span>
        ) : some ? (
          <span className="text-[11px] leading-none" aria-hidden>−</span>
        ) : null}
      </button>
    );
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
    const categoryLabel = getCategoryLabel(transaction.category, language);
    const categoryEmoji = getCategoryEmoji(transaction.category);
    const inner = (
      <div className="grid grid-cols-1 md:grid-cols-[90px_1fr_150px_160px] gap-2 md:gap-4 items-center">
        <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0">
          <span className="text-xs font-semibold text-gray-500">
            {t('transactionExplorer.dayLabel')}
          </span>
          <span className="text-base font-extrabold text-indigo-700 tabular-nums">
            {transaction.day}
          </span>
          <span className="text-[11px] text-gray-400">{weekday}</span>
          <span className="text-[11px] text-gray-500">{dayDateLabel}</span>
        </div>

        <div className="min-w-0">
          <p className="font-bold text-gray-800 truncate">
            {transaction.description || t('multiMonthTransactionExplorer.unnamed')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isIncome ? t('transactionExplorer.income') : t('transactionExplorer.expense')}
            {categoryLabel ? ` · ${categoryEmoji ? `${categoryEmoji} ` : ''}${categoryLabel}` : ''}
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

    if (!canEdit) {
      return (
        <div
          key={`${transaction.monthKey}-${transaction.day}-${transaction.id}`}
          className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm"
        >
          {inner}
        </div>
      );
    }

    return (
      <SelectableTransactionRow
        key={`${transaction.monthKey}-${transaction.day}-${transaction.id}`}
        selected={isSelected(transaction.id)}
        selecting={isSelecting}
        checkboxLabel={t('moveTransactions.selectLabel')}
        bind={bindItem(transaction.id)}
        onToggle={() => toggleId(transaction.id)}
        consumeSuppressedClick={consumeSuppressedClick}
      >
        {inner}
      </SelectableTransactionRow>
    );
  };

  const renderGroupMeta = (count: number, income: number, expense: number) => (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-700">
        {t('multiMonthTransactionExplorer.groupMatches', { count })}
      </span>
      {income > 0 && (
        <span className="tabular-nums font-semibold text-emerald-700">
          +{displaySymbol}{formatNumber(income, 0)}
        </span>
      )}
      {expense > 0 && (
        <span className="tabular-nums font-semibold text-rose-700">
          −{displaySymbol}{formatNumber(expense, 0)}
        </span>
      )}
    </div>
  );

  const renderGroupHeader = ({
    groupKey,
    ids,
    selectLabel,
    title,
    subtitle,
    count,
    income,
    expense
  }: {
    groupKey: string;
    ids: string[];
    selectLabel: string;
    title: string;
    subtitle: React.ReactNode;
    count: number;
    income: number;
    expense: number;
  }) => {
    const open = isGroupOpen(groupKey);
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-indigo-50 ${
          open ? 'border-b border-indigo-100' : ''
        }`}
      >
        {canEdit && renderGroupSelectButton(ids, selectLabel)}
        <button
          type="button"
          onClick={() => toggleGroupOpen(groupKey)}
          className="min-w-0 flex-1 flex items-center justify-between gap-3 text-left rounded-lg hover:bg-indigo-100/70 transition-colors px-1 py-0.5 -mx-1"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate">{title}</h3>
            {subtitle ? <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div> : null}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {renderGroupMeta(count, income, expense)}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
              {open
                ? t('multiMonthTransactionExplorer.collapseGroup')
                : t('multiMonthTransactionExplorer.expandGroup')}
              <span aria-hidden>{open ? '▲' : '▼'}</span>
            </span>
          </div>
        </button>
      </div>
    );
  };

  const selectedCount = selectedList.length;
  const bar =
    selectedCount > 0 && canEdit
      ? createPortal(
          <div className="fixed inset-x-0 bottom-0 z-[45] pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border-2 border-indigo-200 bg-white shadow-2xl px-4 py-3 flex flex-col gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">
                  {t('moveTransactions.selected', { count: selectedCount })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('moveTransactions.barHint')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-3 py-2.5 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={openEdit}
                  disabled={!onEditTransactions}
                  className="px-3 py-2.5 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {t('moveTransactions.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={!onDeleteTransactions}
                  className="px-3 py-2.5 rounded-lg font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {t('moveTransactions.delete')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100 mb-4 sm:mb-6 ${isSelecting ? 'pb-36' : ''}`}>
      <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${isExpanded ? 'mb-4' : ''}`}>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 font-display flex items-center gap-2">
            {t('multiMonthTransactionExplorer.title')}
            <InfoTip text={t('infoTips.multiMonthExplorer')} />
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
              {displayedTransactions.length}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
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

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-4">
            <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setGroupBy('description')}
                className={`px-3 py-2 text-sm font-semibold ${
                  groupBy === 'description'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('multiMonthTransactionExplorer.groupByDescription')}
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('month')}
                className={`px-3 py-2 text-sm font-semibold border-l-2 border-gray-200 ${
                  groupBy === 'month'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('multiMonthTransactionExplorer.groupByMonth')}
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 px-2 py-1">
              <input
                type="checkbox"
                checked={repeatsOnly}
                onChange={(event) => setRepeatsOnly(event.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {t('multiMonthTransactionExplorer.repeatsOnly')}
            </label>

            {canEdit && visibleIds.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  allVisibleSelected ? removeIds(visibleIds) : addIds(visibleIds)
                }
                className="px-3 py-2 rounded-xl text-sm font-semibold border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                {allVisibleSelected
                  ? t('multiMonthTransactionExplorer.deselectAllMatches')
                  : t('multiMonthTransactionExplorer.selectAllMatches')}
              </button>
            )}
          </div>

          {canEdit && (
            <p className="text-xs text-gray-500 mb-3">
              {t('multiMonthTransactionExplorer.selectHint')}
            </p>
          )}

          {displayedTransactions.length > 0 ? (
            <div className="space-y-4">
              {groupBy === 'description'
                ? groupedByDescription.map((group) => {
                    const ids = group.transactions.map((item) => item.id);
                    const open = isGroupOpen(group.key);
                    const sameAmounts = amountsMatchAcross(group.transactions);
                    if (group.transactions.length === 1) {
                      return renderTransaction(group.transactions[0]);
                    }

                    return (
                      <section
                        key={group.key}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden"
                      >
                        {renderGroupHeader({
                          groupKey: group.key,
                          ids,
                          selectLabel: t('multiMonthTransactionExplorer.selectGroup', {
                            name: groupTitle(group.name)
                          }),
                          title: groupTitle(group.name),
                          subtitle: sameAmounts
                            ? `${formatNumber(group.transactions[0].amount, 2)} ${group.transactions[0].currency}`
                            : t('multiMonthTransactionExplorer.mixedAmounts'),
                          count: group.transactions.length,
                          income: group.income,
                          expense: group.expense
                        })}
                        {open && (
                          <div className="p-3 space-y-2">
                            {group.transactions.map(renderTransaction)}
                          </div>
                        )}
                      </section>
                    );
                  })
                : groupedByMonth.map((group) => {
                    const ids = group.transactions.map((item) => item.id);
                    const open = isGroupOpen(`month:${group.key}`);
                    return (
                      <section
                        key={group.key}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden"
                      >
                        {renderGroupHeader({
                          groupKey: `month:${group.key}`,
                          ids,
                          selectLabel: t('multiMonthTransactionExplorer.selectGroup', {
                            name: group.label
                          }),
                          title: group.label,
                          subtitle: group.key,
                          count: group.transactions.length,
                          income: group.income,
                          expense: group.expense
                        })}
                        {open && (
                          <div className="p-3 space-y-2">
                            {group.transactions.map(renderTransaction)}
                          </div>
                        )}
                      </section>
                    );
                  })}
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

      {bar}
      <BulkEditTransactionsModal
        isOpen={editOpen}
        onClose={closeEdit}
        onSave={saveEdits}
        items={editItems}
        selectedCurrencies={selectedCurrencies}
      />
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title={t('moveTransactions.deleteTitle')}
        message={t('moveTransactions.deleteMessage', { count: selectedCount })}
        confirmButtonText={t('moveTransactions.delete')}
        cancelButtonText={t('common.cancel')}
        danger
      />
    </div>
  );
};

export default React.memo(MultiMonthTransactionExplorer);
