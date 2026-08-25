import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Day, MonthSlice } from '../types';
import {
  applyTransactionEdits,
  collectTransactionsByIds,
  deleteTransactionsByIds,
  listMoveTargetMonths,
  moveTransactionsToMonth,
  CollectedTransaction,
  MoveTransactionsToMonthRequest,
  MoveTransactionsToMonthResult,
  TransactionEditPatch
} from '../utils/moveTransactions';
import {
  buildCalendarCellsForMonthMondayFirst,
  getDaysInMonth,
  getMonthYearLabel,
  getWeekdayLabelsMondayFirst
} from '../utils/dateHelpers';
import { formatMonthKey, parseMonthKey } from '../utils/monthlyPlan';
import { useTransactionMoveSelection } from '../hooks/useTransactionMoveSelection';
import type { TransactionItemBind } from '../hooks/useTransactionMoveSelection';
import ConfirmModal from './ConfirmModal';
import BulkEditTransactionsModal from './BulkEditTransactionsModal';

interface TransactionMoveContextValue {
  isSelecting: boolean;
  isSelected: (transactionId: string) => boolean;
  toggleId: (transactionId: string) => void;
  bindItem: (transactionId: string) => TransactionItemBind;
  consumeSuppressedClick: () => boolean;
}

const TransactionMoveContext = createContext<TransactionMoveContextValue | null>(null);

export const useTransactionMove = (): TransactionMoveContextValue => {
  const value = useContext(TransactionMoveContext);
  if (!value) {
    return {
      isSelecting: false,
      isSelected: () => false,
      toggleId: () => undefined,
      bindItem: () => ({
        onPointerDown: () => undefined,
        onContextMenu: (event) => event.preventDefault(),
        onClick: () => undefined
      }),
      consumeSuppressedClick: () => false
    };
  }
  return value;
};

interface TransactionMoveProviderProps {
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  budgetYear: number;
  budgetMonth: number;
  selectedCurrencies?: string[];
  readOnly?: boolean;
  monthsByKey?: Record<string, MonthSlice>;
  onMoveTransactions?: (request: MoveTransactionsToMonthRequest) => MoveTransactionsToMonthResult;
  children: React.ReactNode;
}

const TransactionMoveProvider: React.FC<TransactionMoveProviderProps> = ({
  days,
  updateDay,
  budgetYear,
  budgetMonth,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  readOnly = false,
  monthsByKey,
  onMoveTransactions,
  children
}) => {
  const { t, i18n } = useTranslation();
  const {
    selectedList,
    isSelecting,
    isSelected,
    toggleId,
    bindItem,
    consumeSuppressedClick,
    clearSelection,
    pruneToExistingIds
  } = useTransactionMoveSelection(!readOnly);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(budgetYear);
  const [pickerMonth, setPickerMonth] = useState(budgetMonth);
  const [targetDay, setTargetDay] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editItems, setEditItems] = useState<CollectedTransaction[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    days.forEach((day) => {
      (day?.transactions || []).forEach((tx) => {
        if (tx?.id) ids.add(tx.id);
      });
    });
    return ids;
  }, [days]);

  useEffect(() => {
    pruneToExistingIds(existingIds);
  }, [existingIds, pruneToExistingIds]);

  useEffect(() => {
    clearSelection();
    setPickerOpen(false);
    setPickerYear(budgetYear);
    setPickerMonth(budgetMonth);
    setTargetDay(null);
    setEditOpen(false);
    setEditItems([]);
    setDeleteConfirmOpen(false);
  }, [budgetYear, budgetMonth, clearSelection]);

  const availableMonths = useMemo(
    () => listMoveTargetMonths(monthsByKey, budgetYear, budgetMonth),
    [monthsByKey, budgetYear, budgetMonth]
  );

  const pickerIndex = useMemo(
    () =>
      availableMonths.findIndex(
        (item) => item.year === pickerYear && item.month === pickerMonth
      ),
    [availableMonths, pickerYear, pickerMonth]
  );

  const prevMonth = pickerIndex > 0 ? availableMonths[pickerIndex - 1] : null;
  const nextMonth =
    pickerIndex >= 0 && pickerIndex < availableMonths.length - 1
      ? availableMonths[pickerIndex + 1]
      : null;

  const goToPickerMonth = (year: number, month: number) => {
    setPickerYear(year);
    setPickerMonth(month);
    setTargetDay((prev) => {
      if (prev === null) return prev;
      return Math.min(prev, getDaysInMonth(year, month));
    });
  };

  const sourceDays = useMemo(() => {
    const result = new Set<number>();
    const selected = new Set(selectedList);
    if (selected.size === 0) return result;
    days.forEach((day) => {
      if ((day?.transactions || []).some((tx) => tx?.id && selected.has(tx.id))) {
        result.add(day.day);
      }
    });
    return result;
  }, [days, selectedList]);

  const isPickerOnSourceMonth = pickerYear === budgetYear && pickerMonth === budgetMonth;

  const movePreview = useMemo(() => {
    if (targetDay === null) return null;
    return moveTransactionsToMonth({
      sourceDays: days,
      sourceYear: budgetYear,
      sourceMonth: budgetMonth,
      monthsByKey,
      transactionIds: selectedList,
      targetYear: pickerYear,
      targetMonth: pickerMonth,
      targetDay,
      selectedCurrencies
    });
  }, [
    days,
    budgetYear,
    budgetMonth,
    monthsByKey,
    selectedList,
    pickerYear,
    pickerMonth,
    targetDay,
    selectedCurrencies
  ]);

  const movableCount = movePreview?.movedCount ?? 0;
  const moveError = movePreview?.error;

  const { calendarCells, monthYearLabel, weekdayLabels, pickerMonthKey } = useMemo(() => {
    const locale = i18n.language || 'en';
    return {
      calendarCells: buildCalendarCellsForMonthMondayFirst(pickerYear, pickerMonth),
      monthYearLabel: getMonthYearLabel(locale, pickerYear, pickerMonth),
      weekdayLabels: getWeekdayLabelsMondayFirst(locale),
      pickerMonthKey: formatMonthKey(pickerYear, pickerMonth)
    };
  }, [pickerYear, pickerMonth, i18n.language]);

  const applyDaysDiff = (nextDays: Day[]) => {
    nextDays.forEach((day, index) => {
      if (day !== days[index]) {
        updateDay(index, 'transactions', day.transactions);
      }
    });
  };

  const openPicker = () => {
    if (selectedList.length === 0) return;
    setPickerYear(budgetYear);
    setPickerMonth(budgetMonth);
    setTargetDay(null);
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setTargetDay(null);
    setPickerYear(budgetYear);
    setPickerMonth(budgetMonth);
  };

  const confirmMove = () => {
    if (targetDay === null) return;
    const request: MoveTransactionsToMonthRequest = {
      transactionIds: selectedList,
      targetYear: pickerYear,
      targetMonth: pickerMonth,
      targetDay
    };

    if (onMoveTransactions) {
      const result = onMoveTransactions(request);
      if (result.movedCount > 0 && !result.error) {
        clearSelection();
        closePicker();
      }
      return;
    }

    const isSameMonth = pickerYear === budgetYear && pickerMonth === budgetMonth;
    if (!isSameMonth) return;

    const result = moveTransactionsToMonth({
      sourceDays: days,
      sourceYear: budgetYear,
      sourceMonth: budgetMonth,
      monthsByKey,
      ...request,
      selectedCurrencies
    });
    if (result.movedCount > 0 && !result.error) {
      applyDaysDiff(result.nextSourceDays);
      clearSelection();
      closePicker();
    }
  };

  const openEdit = () => {
    if (selectedList.length === 0) return;
    setEditItems(collectTransactionsByIds(days, selectedList));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditItems([]);
  };

  const saveEdits = (patches: TransactionEditPatch[]) => {
    const { nextDays, updatedCount } = applyTransactionEdits(days, patches);
    if (updatedCount > 0) {
      applyDaysDiff(nextDays);
    }
    clearSelection();
    closeEdit();
  };

  const confirmDelete = () => {
    const { nextDays, deletedCount } = deleteTransactionsByIds(days, selectedList);
    if (deletedCount > 0) {
      applyDaysDiff(nextDays);
    }
    setDeleteConfirmOpen(false);
    clearSelection();
  };

  const contextValue = useMemo<TransactionMoveContextValue>(
    () => ({
      isSelecting,
      isSelected,
      toggleId,
      bindItem,
      consumeSuppressedClick
    }),
    [isSelecting, isSelected, toggleId, bindItem, consumeSuppressedClick]
  );

  const selectedCount = selectedList.length;

  const bar =
    selectedCount > 0 && !readOnly
      ? createPortal(
          <div className="fixed inset-x-0 bottom-0 z-[45] pointer-events-none px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border-2 border-indigo-200 bg-white shadow-2xl px-4 py-3 flex flex-col gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800">
                  {t('moveTransactions.selected', { count: selectedCount })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('moveTransactions.barHint')}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  className="px-3 py-2.5 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  {t('moveTransactions.edit')}
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  className="px-3 py-2.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  {t('moveTransactions.move')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="px-3 py-2.5 rounded-lg font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors"
                >
                  {t('moveTransactions.delete')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const picker = pickerOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePicker();
          }}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 border-2 border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-gray-800">{t('moveTransactions.title')}</h2>
              <button
                type="button"
                onClick={closePicker}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                aria-label={t('common.cancel')}
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {t('moveTransactions.subtitle', { count: selectedCount })}
            </p>

            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => prevMonth && goToPickerMonth(prevMonth.year, prevMonth.month)}
                  disabled={!prevMonth}
                  className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={t('moveTransactions.prevMonth')}
                  title={t('moveTransactions.prevMonth')}
                >
                  ‹
                </button>
                <label className="sr-only" htmlFor="move-transaction-month">
                  {t('moveTransactions.pickMonth')}
                </label>
                <select
                  id="move-transaction-month"
                  value={pickerMonthKey}
                  onChange={(event) => {
                    const parsed = parseMonthKey(event.target.value);
                    if (parsed) goToPickerMonth(parsed.year, parsed.month);
                  }}
                  className="min-w-0 flex-1 px-2 py-2 rounded-lg border-2 border-gray-200 bg-white text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {availableMonths.map((item) => (
                    <option key={item.key} value={item.key}>
                      {getMonthYearLabel(i18n.language || 'en', item.year, item.month)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => nextMonth && goToPickerMonth(nextMonth.year, nextMonth.month)}
                  disabled={!nextMonth}
                  className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white text-lg font-bold text-gray-700 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={t('moveTransactions.nextMonth')}
                  title={t('moveTransactions.nextMonth')}
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {weekdayLabels.map((label, idx) => (
                  <div
                    key={`${label}-${idx}`}
                    className="text-center text-[11px] font-bold text-gray-500 select-none"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, idx) => {
                  if (cell === null) {
                    return <div key={`empty-${idx}`} className="h-9" />;
                  }

                  const isTarget = targetDay === cell;
                  const isSource = isPickerOnSourceMonth && sourceDays.has(cell);

                  return (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => setTargetDay(cell)}
                      className={`h-9 rounded-lg text-sm font-semibold transition-all border ${
                        isTarget
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : isSource
                            ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                            : 'bg-white text-gray-800 border-gray-200 hover:bg-indigo-50'
                      }`}
                      aria-pressed={isTarget}
                    >
                      {cell}
                    </button>
                  );
                })}
              </div>
            </div>

            {targetDay !== null && moveError === 'month-limit' && (
              <p className="mt-3 text-xs text-amber-700 font-medium whitespace-pre-line">
                {t('moveTransactions.monthLimit', {
                  month: monthYearLabel,
                  existing: movePreview?.limitExisting,
                  adding: movePreview?.limitAdding,
                  max: movePreview?.limitMax
                })}
              </p>
            )}
            {targetDay !== null && moveError === 'would-drop-data' && (
              <p className="mt-3 text-xs text-amber-700 font-medium">
                {t('moveTransactions.wouldDropData')}
              </p>
            )}
            {targetDay !== null &&
              (moveError === 'nothing-to-move' || (movableCount === 0 && !moveError)) && (
                <p className="mt-3 text-xs text-amber-700 font-medium">
                  {t('moveTransactions.sameDay')}
                </p>
              )}
            {targetDay !== null && movableCount > 0 && !moveError && !isPickerOnSourceMonth && (
              <p className="mt-3 text-xs text-indigo-700 font-medium">
                {t('moveTransactions.destinationHint', {
                  month: monthYearLabel,
                  day: targetDay
                })}
              </p>
            )}

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={closePicker}
                className="flex-1 py-2.5 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmMove}
                disabled={targetDay === null || movableCount === 0 || Boolean(moveError)}
                className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-white transition-colors ${
                  targetDay === null || movableCount === 0 || Boolean(moveError)
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {t('moveTransactions.confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <TransactionMoveContext.Provider value={contextValue}>
      <div className={isSelecting ? 'pb-36' : undefined}>{children}</div>
      {bar}
      {picker}
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
    </TransactionMoveContext.Provider>
  );
};

export default TransactionMoveProvider;
