import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExchangeRates, Transaction } from '../types';
import {
  buildPlannerRows,
  getDefaultPlannerStart,
  getRollingMonths,
  PlannedMonth,
  PlannerRow,
  shiftMonths
} from '../utils/monthlyPlan';
import { convertCurrency, formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { generateTransactionId } from '../utils/dayHelpers';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import CurrencyFlag from './CurrencyFlag';
import ConfirmModal from './ConfirmModal';
import MonthlyPlanTransactionModal, {
  MonthlyPlanTransactionDraft
} from './MonthlyPlanTransactionModal';

export type MonthlyPlannerHandle = {
  /** Opens the planned-transaction modal (same UI as before; call from Settings). */
  openAddPlannedModal: (defaultSelectedMonthKeys?: string[]) => void;
};

interface MonthlyPlannerProps {
  isUk: boolean;
  /** Active budget's full monthlyPlans map. */
  monthlyPlans: Record<string, Transaction[]>;
  /** Replace the transactions for one month. */
  updateMonthlyPlan: (monthKey: string, transactions: Transaction[]) => void;
  /** Apply many month-level updates atomically (per-month replace). */
  bulkUpdateMonthlyPlans: (updates: Record<string, Transaction[]>) => void;
  /** Currently active budget month/year — used for past-month detection. */
  budgetYear: number;
  budgetMonth: number;
  /** Persisted start of the rolling 12-month window. */
  plannerStartYear: number;
  plannerStartMonth: number;
  setPlannerStart: (year: number, month: number) => void;
  /** Persisted month key currently expanded in the planner. */
  expandedMonth: string | null;
  setExpandedMonth: (key: string | null) => void;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  /** Projected balance at end of current budget month (in display currency). */
  startingBalance: number;
}

const MAX_TRANSACTIONS_PER_MONTH = 30;

interface PendingNavigation {
  year: number;
  month: number;
  /** Last month in the new window (used in the confirmation message). */
  endLabel: string;
}

interface ModalState {
  isOpen: boolean;
  /** When set, edit mode for that month/transaction. */
  editing: { monthKey: string; transaction: Transaction } | null;
  /** Default-checked months when adding a new transaction. */
  defaultSelectedKeys: string[];
}

const MonthlyPlanner = forwardRef<MonthlyPlannerHandle, MonthlyPlannerProps>(function MonthlyPlanner({
  isUk,
  monthlyPlans,
  updateMonthlyPlan,
  bulkUpdateMonthlyPlans,
  budgetYear,
  budgetMonth,
  plannerStartYear,
  plannerStartMonth,
  setPlannerStart,
  expandedMonth,
  setExpandedMonth,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startingBalance
}, ref) {
  const { t, i18n: i18nInstance } = useTranslation();
  const symbol = getCurrencySymbol(displayCurrency);
  const locale = i18nInstance.language || (isUk ? 'uk' : 'en');

  const months = useMemo(
    () => getRollingMonths(plannerStartYear, plannerStartMonth, 12),
    [plannerStartYear, plannerStartMonth]
  );

  const rows = useMemo(
    () => buildPlannerRows({
      months,
      monthlyPlans: monthlyPlans || {},
      startingBalance,
      displayCurrency,
      exchangeRates,
      budgetYear,
      budgetMonth
    }),
    [months, monthlyPlans, startingBalance, displayCurrency, exchangeRates, budgetYear, budgetMonth]
  );

  const grandTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    rows.forEach((row) => {
      income += row.income;
      expense += row.expense;
    });
    return { income, expense, net: income - expense };
  }, [rows]);

  const lastForecastedRow = [...rows].reverse().find((r) => r.cumulative !== null);
  const finalProjected = lastForecastedRow ? lastForecastedRow.cumulative! : startingBalance;

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const windowLabel = useMemo(() => {
    if (!firstMonth || !lastMonth) return '';
    const a = capitalizeFirstLetter(getMonthYearLabel(locale, firstMonth.year, firstMonth.month));
    const b = capitalizeFirstLetter(getMonthYearLabel(locale, lastMonth.year, lastMonth.month));
    return `${a} — ${b}`;
  }, [firstMonth, lastMonth, locale]);

  const defaultStart = getDefaultPlannerStart(budgetYear, budgetMonth);
  const isAtDefaultStart =
    plannerStartYear === defaultStart.year && plannerStartMonth === defaultStart.month;

  // Forward-navigation confirmation: triggered when the resulting window's
  // last month lies in a year > current calendar year.
  const currentCalendarYear = new Date().getFullYear();
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  const tryNavigate = (deltaMonths: number) => {
    const nextStart = shiftMonths(plannerStartYear, plannerStartMonth, deltaMonths);
    const nextLast = shiftMonths(nextStart.year, nextStart.month, 11);
    const navigatingForward = deltaMonths > 0;
    const enteringFuture = nextLast.year > currentCalendarYear;
    if (navigatingForward && enteringFuture) {
      setPendingNav({
        year: nextStart.year,
        month: nextStart.month,
        endLabel: capitalizeFirstLetter(getMonthYearLabel(locale, nextLast.year, nextLast.month))
      });
      return;
    }
    setPlannerStart(nextStart.year, nextStart.month);
  };

  const confirmPendingNavigation = () => {
    if (!pendingNav) return;
    setPlannerStart(pendingNav.year, pendingNav.month);
    setPendingNav(null);
  };

  const resetWindow = () => {
    setPlannerStart(defaultStart.year, defaultStart.month);
  };

  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    editing: null,
    defaultSelectedKeys: []
  });
  const [pendingDelete, setPendingDelete] = useState<{
    monthKey: string;
    transactionId: string;
  } | null>(null);
  const [pendingClear, setPendingClear] = useState<string | null>(null);

  // The transaction modal can target any non-past month in the visible window.
  const selectableMonths = useMemo<PlannedMonth[]>(
    () => rows.filter((r) => !r.isPast).map((r) => ({ key: r.key, year: r.year, month: r.month })),
    [rows]
  );

  // Auto-collapse expanded month if it scrolled out of the visible window.
  useEffect(() => {
    if (!expandedMonth) return;
    if (!months.some((m) => m.key === expandedMonth)) {
      setExpandedMonth(null);
    }
  }, [months, expandedMonth, setExpandedMonth]);

  useImperativeHandle(ref, () => ({
    openAddPlannedModal: (defaultSelectedMonthKeys: string[] = []) => {
      setModal({
        isOpen: true,
        editing: null,
        defaultSelectedKeys: defaultSelectedMonthKeys ?? []
      });
    }
  }), []);

  const openEditModal = (monthKey: string, transaction: Transaction) => {
    setModal({ isOpen: true, editing: { monthKey, transaction }, defaultSelectedKeys: [] });
  };

  const closeModal = () => {
    setModal({ isOpen: false, editing: null, defaultSelectedKeys: [] });
  };

  const handleSaveTransaction = (
    data: MonthlyPlanTransactionDraft,
    monthKeys: string[]
  ) => {
    if (modal.editing) {
      const { monthKey, transaction } = modal.editing;
      const existing = Array.isArray(monthlyPlans[monthKey]) ? monthlyPlans[monthKey] : [];
      const next = existing.map((tx) =>
        tx.id === transaction.id
          ? ({
            ...tx,
            type: data.type,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            id: transaction.id
          } as Transaction)
          : tx
      );
      updateMonthlyPlan(monthKey, next);
      return;
    }

    // Add mode: append a unique transaction to each selected month.
    const updates: Record<string, Transaction[]> = {};
    monthKeys.forEach((key) => {
      const existing = Array.isArray(monthlyPlans[key]) ? monthlyPlans[key] : [];
      if (existing.length >= MAX_TRANSACTIONS_PER_MONTH) return;
      const newTx: Transaction = {
        id: generateTransactionId(),
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        description: data.description
      };
      updates[key] = [...existing, newTx];
    });
    bulkUpdateMonthlyPlans(updates);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    const { monthKey, transactionId } = pendingDelete;
    const existing = Array.isArray(monthlyPlans[monthKey]) ? monthlyPlans[monthKey] : [];
    updateMonthlyPlan(monthKey, existing.filter((tx) => tx.id !== transactionId));
    setPendingDelete(null);
  };

  const handleConfirmClear = () => {
    if (!pendingClear) return;
    updateMonthlyPlan(pendingClear, []);
    setPendingClear(null);
  };

  const toggleExpand = (key: string) => {
    setExpandedMonth(expandedMonth === key ? null : key);
  };

  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-100 mb-4 sm:mb-6 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 p-4 sm:p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-extrabold font-display">
              {t('monthlyPlanner.title')}
            </h2>
            <p className="text-sm text-blue-100 mt-1">
              {t('monthlyPlanner.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full border border-white/20">
              <CurrencyFlag currencyCode={displayCurrency} size={16} />
              {t('overviewDashboard.displayingIn', { currency: displayCurrency })}
            </span>
          </div>
        </div>

        {/* Window navigation */}
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 bg-white/10 rounded-full border border-white/20 p-1">
            <button
              type="button"
              onClick={() => tryNavigate(-12)}
              className="px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold hover:bg-white/15"
              title={t('monthlyPlanner.nav.prevYear')}
            >
              «
            </button>
            <button
              type="button"
              onClick={() => tryNavigate(-1)}
              className="px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold hover:bg-white/15"
              title={t('monthlyPlanner.nav.prevMonth')}
            >
              ‹
            </button>
            <span className="px-3 py-1 text-xs sm:text-sm font-bold tabular-nums">
              {windowLabel}
            </span>
            <button
              type="button"
              onClick={() => tryNavigate(1)}
              className="px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold hover:bg-white/15"
              title={t('monthlyPlanner.nav.nextMonth')}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => tryNavigate(12)}
              className="px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold hover:bg-white/15"
              title={t('monthlyPlanner.nav.nextYear')}
            >
              »
            </button>
          </div>
          {!isAtDefaultStart && (
            <button
              type="button"
              onClick={resetWindow}
              className="text-xs sm:text-sm font-semibold bg-white/15 hover:bg-white/25 border border-white/20 rounded-full px-3 py-1"
            >
              {t('monthlyPlanner.nav.reset')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
          <SummaryTile
            label={t('monthlyPlanner.startingBalance')}
            value={`${symbol}${formatNumber(startingBalance, 2)}`}
          />
          <SummaryTile
            label={t('monthlyPlanner.totalIncome')}
            value={`${symbol}${formatNumber(grandTotals.income, 2)}`}
            valueClass="text-emerald-200"
          />
          <SummaryTile
            label={t('monthlyPlanner.totalExpense')}
            value={`${symbol}${formatNumber(grandTotals.expense, 2)}`}
            valueClass="text-rose-200"
          />
          <SummaryTile
            label={t('monthlyPlanner.endProjection')}
            value={`${symbol}${formatNumber(finalProjected, 2)}`}
            valueClass={finalProjected >= 0 ? 'text-emerald-200' : 'text-rose-200'}
            highlight
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-700">
                {t('monthlyPlanner.month')}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-emerald-700">
                {t('monthlyPlanner.income')}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-rose-700">
                {t('monthlyPlanner.expense')}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-gray-700">
                {t('monthlyPlanner.net')}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-indigo-700">
                {t('monthlyPlanner.projected')}
              </th>
              <th className="px-3 py-3 text-right font-semibold text-gray-700">
                {t('monthlyPlanner.details')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => {
              const isExpanded = expandedMonth === row.key;
              const monthLabel = capitalizeFirstLetter(
                getMonthYearLabel(locale, row.year, row.month)
              );
              const cumulativeNumeric =
                row.cumulative !== null && row.cumulative >= 0;
              const netSignClass =
                row.net > 0
                  ? 'text-emerald-600'
                  : row.net < 0
                    ? 'text-rose-600'
                    : 'text-gray-500';

              return (
                <React.Fragment key={row.key}>
                  <tr
                    className={`${
                      row.isPast ? 'bg-slate-100/60 text-gray-500' : (index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')
                    } hover:bg-indigo-50/60 transition-colors`}
                  >
                    <td className="px-3 py-3 font-bold">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          row.isPast ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {index + 1}
                        </span>
                        <span>{monthLabel}</span>
                        {row.transactions.length > 0 && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                            {row.transactions.length}
                          </span>
                        )}
                        {row.isPast && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600">
                            {t('monthlyPlanner.pastBadge')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${row.income > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {row.income > 0 ? `${symbol}${formatNumber(row.income, 2)}` : '—'}
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${row.expense > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                      {row.expense > 0 ? `${symbol}${formatNumber(row.expense, 2)}` : '—'}
                    </td>
                    <td className={`px-3 py-3 text-right font-bold ${netSignClass}`}>
                      {row.net !== 0
                        ? `${row.net > 0 ? '+' : ''}${symbol}${formatNumber(row.net, 2)}`
                        : '—'}
                    </td>
                    <td className={`px-3 py-3 text-right font-extrabold ${
                      row.cumulative === null
                        ? 'text-gray-400'
                        : cumulativeNumeric
                          ? 'text-emerald-700 bg-emerald-50/60'
                          : 'text-rose-700 bg-rose-50/60'
                    }`}>
                      {row.cumulative === null
                        ? '—'
                        : `${symbol}${formatNumber(row.cumulative, 2)}`}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleExpand(row.key)}
                        aria-expanded={isExpanded}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold"
                      >
                        {isExpanded ? t('common.collapse') : t('common.expand')}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-indigo-50/40">
                      <td colSpan={6} className="px-3 py-3">
                        <MonthDetailList
                          row={row}
                          displayCurrency={displayCurrency}
                          exchangeRates={exchangeRates}
                          isReadOnly={row.isPast}
                          onEdit={(tx) => openEditModal(row.key, tx)}
                          onDelete={(tx) => setPendingDelete({ monthKey: row.key, transactionId: tx.id })}
                          onClear={() => setPendingClear(row.key)}
                          emptyText={t('monthlyPlanner.empty')}
                          incomeLabel={t('transactionExplorer.income')}
                          expenseLabel={t('transactionExplorer.expense')}
                          editLabel={t('transaction.edit')}
                          deleteLabel={t('transaction.delete')}
                          clearLabel={t('monthlyPlanner.clearMonth')}
                          convertedTo={t('transactionExplorer.convertedTo', { currency: displayCurrency })}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden p-3 space-y-3">
        {rows.map((row, index) => {
          const isExpanded = expandedMonth === row.key;
          const monthLabel = capitalizeFirstLetter(
            getMonthYearLabel(locale, row.year, row.month)
          );
          const cumulativeNumeric = row.cumulative !== null && row.cumulative >= 0;
          const netSignClass =
            row.net > 0
              ? 'text-emerald-600'
              : row.net < 0
                ? 'text-rose-600'
                : 'text-gray-500';
          return (
            <div
              key={row.key}
              className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
                row.isPast ? 'border-slate-200 opacity-80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                    row.isPast ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="font-bold text-gray-800 text-sm">{monthLabel}</span>
                  {row.transactions.length > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                      {row.transactions.length}
                    </span>
                  )}
                  {row.isPast && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600">
                      {t('monthlyPlanner.pastBadge')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleExpand(row.key)}
                  className="text-xs px-2 py-1 rounded-lg bg-slate-200 text-slate-700"
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 text-xs">
                <div>
                  <p className="text-gray-500">{t('monthlyPlanner.income')}</p>
                  <p className={`font-bold tabular-nums ${row.income > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {row.income > 0 ? `${symbol}${formatNumber(row.income, 2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">{t('monthlyPlanner.expense')}</p>
                  <p className={`font-bold tabular-nums ${row.expense > 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                    {row.expense > 0 ? `${symbol}${formatNumber(row.expense, 2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">{t('monthlyPlanner.net')}</p>
                  <p className={`font-bold tabular-nums ${netSignClass}`}>
                    {row.net !== 0 ? `${row.net > 0 ? '+' : ''}${symbol}${formatNumber(row.net, 2)}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">{t('monthlyPlanner.projected')}</p>
                  <p className={`font-extrabold tabular-nums ${
                    row.cumulative === null ? 'text-gray-400' : cumulativeNumeric ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {row.cumulative === null
                      ? '—'
                      : `${symbol}${formatNumber(row.cumulative, 2)}`}
                  </p>
                </div>
              </div>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <MonthDetailList
                    row={row}
                    displayCurrency={displayCurrency}
                    exchangeRates={exchangeRates}
                    isReadOnly={row.isPast}
                    onEdit={(tx) => openEditModal(row.key, tx)}
                    onDelete={(tx) => setPendingDelete({ monthKey: row.key, transactionId: tx.id })}
                    onClear={() => setPendingClear(row.key)}
                    emptyText={t('monthlyPlanner.empty')}
                    incomeLabel={t('transactionExplorer.income')}
                    expenseLabel={t('transactionExplorer.expense')}
                    editLabel={t('transaction.edit')}
                    deleteLabel={t('transaction.delete')}
                    clearLabel={t('monthlyPlanner.clearMonth')}
                    convertedTo={t('transactionExplorer.convertedTo', { currency: displayCurrency })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MonthlyPlanTransactionModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        onSave={handleSaveTransaction}
        transaction={modal.editing ? modal.editing.transaction : null}
        selectableMonths={selectableMonths}
        defaultSelectedMonthKeys={modal.defaultSelectedKeys}
        lockedMonthKey={modal.editing ? modal.editing.monthKey : null}
        selectedCurrencies={selectedCurrencies}
        isUk={isUk}
      />

      <ConfirmModal
        isOpen={pendingNav !== null}
        onClose={() => setPendingNav(null)}
        onConfirm={confirmPendingNavigation}
        title={t('monthlyPlanner.futureYearConfirm.title')}
        message={t('monthlyPlanner.futureYearConfirm.message', {
          range: pendingNav?.endLabel || ''
        })}
        confirmButtonText={t('monthlyPlanner.futureYearConfirm.confirm')}
        cancelButtonText={t('common.cancel')}
      />

      <ConfirmModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={t('monthlyPlanner.deleteTitle')}
        message={t('monthlyPlanner.deleteMessage')}
        confirmButtonText={t('transaction.delete')}
        cancelButtonText={t('common.cancel')}
      />

      <ConfirmModal
        isOpen={pendingClear !== null}
        onClose={() => setPendingClear(null)}
        onConfirm={handleConfirmClear}
        title={t('monthlyPlanner.clearMonthConfirm.title')}
        message={t('monthlyPlanner.clearMonthConfirm.message')}
        confirmButtonText={t('monthlyPlanner.clearMonth')}
        cancelButtonText={t('common.cancel')}
      />
    </div>
  );
});

interface SummaryTileProps {
  label: string;
  value: string;
  valueClass?: string;
  highlight?: boolean;
}

const SummaryTile: React.FC<SummaryTileProps> = ({ label, value, valueClass, highlight }) => (
  <div className={`rounded-xl border p-3 ${highlight ? 'bg-white/15 border-white/30' : 'bg-white/10 border-white/20'}`}>
    <p className="text-[11px] uppercase tracking-wide text-blue-100 font-semibold">{label}</p>
    <p className={`text-base sm:text-lg font-extrabold tabular-nums ${valueClass || ''}`}>{value}</p>
  </div>
);

interface MonthDetailListProps {
  row: PlannerRow;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  isReadOnly: boolean;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onClear: () => void;
  emptyText: string;
  incomeLabel: string;
  expenseLabel: string;
  editLabel: string;
  deleteLabel: string;
  clearLabel: string;
  convertedTo: string;
}

const MonthDetailList: React.FC<MonthDetailListProps> = ({
  row,
  displayCurrency,
  exchangeRates,
  isReadOnly,
  onEdit,
  onDelete,
  onClear,
  emptyText,
  incomeLabel,
  expenseLabel,
  editLabel,
  deleteLabel,
  clearLabel,
  convertedTo
}) => {
  const symbol = getCurrencySymbol(displayCurrency);
  if (!row.transactions.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-center text-sm text-gray-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!isReadOnly && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-xs px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 font-semibold"
          >
            {clearLabel}
          </button>
        </div>
      )}
      {row.transactions.map((tx) => {
        const isIncome = tx.type === 'income';
        const sign = isIncome ? '+' : '-';
        const amount = Number(tx.amount) || 0;
        const sameCurrency =
          String(tx.currency).toUpperCase() === String(displayCurrency).toUpperCase();
        const convertedAmount = sameCurrency
          ? amount
          : convertCurrency(amount, tx.currency, displayCurrency, exchangeRates);

        return (
          <div
            key={tx.id}
            className="rounded-lg bg-white border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-800 truncate">
                <span className={isIncome ? 'text-emerald-600' : 'text-rose-600'}>
                  {isIncome ? '✅' : '❌'}
                </span>{' '}
                {tx.description || (isIncome ? incomeLabel : expenseLabel)}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {sign}
                {formatNumber(amount, 2)} {tx.currency}
                {!sameCurrency && (
                  <span className="ml-2 text-gray-400">
                    {convertedTo} {symbol}
                    {formatNumber(convertedAmount, 2)}
                  </span>
                )}
              </p>
            </div>
            <div className={`text-sm font-extrabold tabular-nums ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
              {sign}
              {symbol}
              {formatNumber(convertedAmount, 2)}
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(tx)}
                  className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold"
                  title={editLabel}
                >
                  ✏️ {editLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(tx)}
                  className="text-xs px-2 py-1 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 font-semibold"
                  title={deleteLabel}
                >
                  🗑️
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MonthlyPlanner;
