import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { MonthSlice } from '../types';
import { getMonthYearLabel } from '../utils/dateHelpers';
import { parseMonthKey } from '../utils/monthlyPlan';
import { getSortedMonthKeys } from '../utils/rollingMonthsBudget';

export interface MonthLimitCandidate {
  key: string;
  year: number;
  month: number;
  transactionCount: number;
}

/** Stored months in chronological order, with their transaction counts. */
export function buildMonthLimitCandidates(
  monthsByKey: Record<string, MonthSlice> | undefined
): MonthLimitCandidate[] {
  return getSortedMonthKeys(monthsByKey).flatMap((key) => {
    const parsed = parseMonthKey(key);
    if (!parsed) return [];
    const days = monthsByKey?.[key]?.days || [];
    const transactionCount = days.reduce(
      (sum, day) => sum + (Array.isArray(day?.transactions) ? day.transactions.length : 0),
      0
    );
    return [{ key, year: parsed.year, month: parsed.month, transactionCount }];
  });
}

interface MonthLimitModalProps {
  isOpen: boolean;
  target: { year: number; month: number } | null;
  activeMonthKey?: string;
  direction: 'forward' | 'backward';
  monthsByKey: Record<string, MonthSlice> | undefined;
  /** How many months must be deleted so the target month fits the 12-month store. */
  requiredCount: number;
  onClose: () => void;
  onConfirm: (monthKeys: string[]) => void;
}

const MonthLimitModal: React.FC<MonthLimitModalProps> = ({
  isOpen,
  target,
  activeMonthKey,
  direction,
  monthsByKey,
  requiredCount,
  onClose,
  onConfirm
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const candidates = useMemo(() => {
    const targetKey = target ? `${target.year}-${String(target.month + 1).padStart(2, '0')}` : null;
    return buildMonthLimitCandidates(monthsByKey).filter(
      (candidate) => candidate.key !== activeMonthKey && candidate.key !== targetKey
    );
  }, [monthsByKey, activeMonthKey, target]);

  const initialRange = useMemo(() => {
    const count = Math.min(Math.max(requiredCount, 1), candidates.length);
    const start = direction === 'backward' ? Math.max(candidates.length - count, 0) : 0;
    return { start, end: Math.min(start + count - 1, candidates.length - 1) };
  }, [direction, requiredCount, candidates.length]);

  const [fromIndex, setFromIndex] = useState(initialRange.start);
  const [toIndex, setToIndex] = useState(initialRange.end);

  useEffect(() => {
    if (!isOpen) return;
    setFromIndex(initialRange.start);
    setToIndex(initialRange.end);
  }, [isOpen, initialRange.start, initialRange.end]);

  if (!isOpen) return null;

  const safeFrom = Math.min(Math.max(fromIndex, 0), Math.max(candidates.length - 1, 0));
  const safeTo = Math.min(Math.max(toIndex, safeFrom), Math.max(candidates.length - 1, 0));
  const selected = candidates.slice(safeFrom, safeTo + 1);
  const selectedTransactionCount = selected.reduce(
    (sum, candidate) => sum + candidate.transactionCount,
    0
  );
  const enough = selected.length > 0 && selected.length >= requiredCount;
  const targetLabel = target ? getMonthYearLabel(locale, target.year, target.month) : '';

  const handleFromChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseInt(event.target.value, 10);
    setFromIndex(next);
    if (safeTo < next) setToIndex(next);
  };

  const handleToChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setToIndex(parseInt(event.target.value, 10));
  };

  const selectFirstMonth = () => {
    setFromIndex(0);
    setToIndex(0);
  };

  const selectLastMonth = () => {
    setFromIndex(candidates.length - 1);
    setToIndex(candidates.length - 1);
  };

  const handleConfirm = () => {
    if (!enough) return;
    onConfirm(selected.map((candidate) => candidate.key));
  };

  const formatCandidate = (candidate: MonthLimitCandidate) =>
    getMonthYearLabel(locale, candidate.year, candidate.month);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-3"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto border-2 border-gray-200"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 flex items-center">
          <span className="mr-2" aria-hidden>
            🗓️
          </span>
          {t('monthYearPicker.overflow.title')}
        </h2>

        <p className="text-sm sm:text-base text-gray-600">
          {t('monthYearPicker.overflow.description', { target: targetLabel })}
        </p>
        <p className="text-xs sm:text-sm text-slate-500 mt-2">
          {direction === 'backward'
            ? t('monthYearPicker.overflow.backwardHint')
            : t('monthYearPicker.overflow.forwardHint')}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2.5 py-1">
            {t('monthYearPicker.overflow.required', { count: Math.max(requiredCount, 1) })}
          </span>
          <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-1">
            {t('monthYearPicker.overflow.selectedMonths', { count: selected.length })}
          </span>
          {selectedTransactionCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-700 px-2.5 py-1">
              {t('monthYearPicker.overflow.selectedTransactions', {
                count: selectedTransactionCount
              })}
            </span>
          )}
        </div>

        {candidates.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t('monthYearPicker.overflow.empty')}
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {t('monthYearPicker.overflow.rangeFrom')}
                </span>
                <select
                  value={safeFrom}
                  onChange={handleFromChange}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold text-gray-900 bg-white"
                >
                  {candidates.map((candidate, index) => (
                    <option key={candidate.key} value={index}>
                      {formatCandidate(candidate)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {t('monthYearPicker.overflow.rangeTo')}
                </span>
                <select
                  value={safeTo}
                  onChange={handleToChange}
                  className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold text-gray-900 bg-white"
                >
                  {candidates.slice(safeFrom).map((candidate, index) => (
                    <option key={candidate.key} value={safeFrom + index}>
                      {formatCandidate(candidate)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={selectFirstMonth}
                className="flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border-2 border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
              >
                {t('monthYearPicker.overflow.quickFirst')}
              </button>
              <button
                type="button"
                onClick={selectLastMonth}
                className="flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border-2 border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
              >
                {t('monthYearPicker.overflow.quickLast')}
              </button>
            </div>

            <ul className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {selected.map((candidate) => (
                <li
                  key={candidate.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white"
                >
                  <span className="font-semibold text-slate-800">
                    {formatCandidate(candidate)}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {t('monthYearPicker.overflow.transactionCount', {
                      count: candidate.transactionCount
                    })}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-slate-500 mt-2">
              {t('monthYearPicker.overflow.moreHint')}
            </p>

            {!enough && (
              <p className="text-xs font-semibold text-amber-700 mt-2">
                {t('monthYearPicker.overflow.notEnough', { count: Math.max(requiredCount, 1) })}
              </p>
            )}
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
          >
            {t('monthYearPicker.overflow.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!enough}
            className="flex-1 px-4 py-3 rounded-lg font-semibold text-white transition-all bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
          >
            {t('monthYearPicker.overflow.confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MonthLimitModal;
