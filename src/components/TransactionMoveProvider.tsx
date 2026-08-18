import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Day } from '../types';
import { moveTransactionsToDay } from '../utils/moveTransactions';
import {
  buildCalendarCellsForMonthMondayFirst,
  getMonthYearLabel,
  getWeekdayLabelsMondayFirst
} from '../utils/dateHelpers';
import { useTransactionMoveSelection } from '../hooks/useTransactionMoveSelection';
import type { TransactionItemBind } from '../hooks/useTransactionMoveSelection';

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
  readOnly?: boolean;
  children: React.ReactNode;
}

const TransactionMoveProvider: React.FC<TransactionMoveProviderProps> = ({
  days,
  updateDay,
  budgetYear,
  budgetMonth,
  readOnly = false,
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
  const [targetDay, setTargetDay] = useState<number | null>(null);

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
    setTargetDay(null);
  }, [budgetYear, budgetMonth, clearSelection]);

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

  const movableCount = useMemo(() => {
    if (targetDay === null) return 0;
    return moveTransactionsToDay(
      days,
      selectedList,
      targetDay,
      budgetYear,
      budgetMonth
    ).movedCount;
  }, [days, selectedList, targetDay, budgetYear, budgetMonth]);

  const { calendarCells, monthYearLabel, weekdayLabels } = useMemo(() => {
    const locale = i18n.language || 'en';
    return {
      calendarCells: buildCalendarCellsForMonthMondayFirst(budgetYear, budgetMonth),
      monthYearLabel: getMonthYearLabel(locale, budgetYear, budgetMonth),
      weekdayLabels: getWeekdayLabelsMondayFirst(locale)
    };
  }, [budgetYear, budgetMonth, i18n.language]);

  const openPicker = () => {
    if (selectedList.length === 0) return;
    setTargetDay(null);
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setTargetDay(null);
  };

  const confirmMove = () => {
    if (targetDay === null) return;
    const { nextDays, movedCount } = moveTransactionsToDay(
      days,
      selectedList,
      targetDay,
      budgetYear,
      budgetMonth
    );
    if (movedCount > 0) {
      nextDays.forEach((day, index) => {
        if (day !== days[index]) {
          updateDay(index, 'transactions', day.transactions);
        }
      });
    }
    clearSelection();
    closePicker();
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
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border-2 border-indigo-200 bg-white shadow-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">
                  {t('moveTransactions.selected', { count: selectedCount })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('moveTransactions.barHint')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  {t('moveTransactions.move')}
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
              <div className="text-center text-sm font-semibold text-gray-800 mb-3">
                {monthYearLabel}
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
                  const isSource = sourceDays.has(cell);

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

            {targetDay !== null && movableCount === 0 && (
              <p className="mt-3 text-xs text-amber-700 font-medium">
                {t('moveTransactions.sameDay')}
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
                disabled={targetDay === null || movableCount === 0}
                className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-white transition-colors ${
                  targetDay === null || movableCount === 0
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
      <div className={isSelecting ? 'pb-28' : undefined}>{children}</div>
      {bar}
      {picker}
    </TransactionMoveContext.Provider>
  );
};

export default TransactionMoveProvider;
