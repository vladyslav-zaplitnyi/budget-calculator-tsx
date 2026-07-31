import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from './ConfirmModal';
import MonthTransactionCounter from './MonthTransactionCounter';
import type { RollingMonthNavigationPreview } from '../types';
import { simulateMonthsAfterNavigation } from '../utils/balanceWaterfall';

interface BudgetMonthSectionProps {
  budgetYear: number;
  budgetMonth: number;
  setBudgetDate: (date: { year: number; month: number }) => void;
  rollingMonthPreview: RollingMonthNavigationPreview | null;
  readOnly: boolean;
  monthTransactionCount: number;
}

const BudgetMonthSection: React.FC<BudgetMonthSectionProps> = ({
  budgetYear,
  budgetMonth,
  setBudgetDate,
  rollingMonthPreview,
  readOnly,
  monthTransactionCount
}) => {
  const { t } = useTranslation();
  const [draftYear, setDraftYear] = useState(budgetYear);
  const [draftMonth, setDraftMonth] = useState(budgetMonth);
  const [trimConfirmOpen, setTrimConfirmOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<{ year: number; month: number; forward: boolean } | null>(
    null
  );

  useEffect(() => {
    setDraftYear(budgetYear);
    setDraftMonth(budgetMonth);
  }, [budgetYear, budgetMonth]);

  const years = useMemo(() => {
    const nowY = new Date().getFullYear();
    const from = Math.min(budgetYear, nowY) - 12;
    const to = Math.max(budgetYear, nowY) + 12;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [budgetYear]);

  const monthNames = t('calendar.monthsLong', { returnObjects: true }) as string[];

  const runNavigate = useCallback(
    (year: number, month: number) => {
      setBudgetDate({ year, month });
      setTrimConfirmOpen(false);
      setPendingNav(null);
    },
    [setBudgetDate]
  );

  const tryNavigate = useCallback(
    (year: number, month: number) => {
      if (readOnly) return;
      if (year === budgetYear && month === budgetMonth) return;

      if (!rollingMonthPreview) {
        runNavigate(year, month);
        return;
      }

      const sim = simulateMonthsAfterNavigation({
        ...rollingMonthPreview,
        oldDate: { year: budgetYear, month: budgetMonth },
        newDate: { year, month }
      });

      if (!sim.exceeds) {
        runNavigate(year, month);
        return;
      }

      setPendingNav({ year, month, forward: sim.forwardJump });
      setTrimConfirmOpen(true);
    },
    [readOnly, rollingMonthPreview, budgetYear, budgetMonth, runNavigate]
  );

  const handleTrimConfirm = useCallback(() => {
    if (!pendingNav) return;
    runNavigate(pendingNav.year, pendingNav.month);
  }, [pendingNav, runNavigate]);

  const handleTrimCancel = useCallback(() => {
    setTrimConfirmOpen(false);
    setPendingNav(null);
    setDraftYear(budgetYear);
    setDraftMonth(budgetMonth);
  }, [budgetYear, budgetMonth]);

  const trimMessage =
    pendingNav?.forward === true
      ? t('monthYearPicker.overflow.forwardMessage')
      : t('monthYearPicker.overflow.backwardMessage');

  const handleTodayClick = () => {
    if (readOnly) return;
    const now = new Date();
    tryNavigate(now.getFullYear(), now.getMonth());
  };

  const handleMonthSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseInt(e.target.value, 10);
    setDraftMonth(next);
    tryNavigate(draftYear, next);
  };

  const handleYearSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = parseInt(e.target.value, 10);
    setDraftYear(next);
    tryNavigate(next, draftMonth);
  };

  const disabled = readOnly;

  return (
    <>
      <section
        className="w-full bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100 mb-4 sm:mb-6 box-border"
        aria-label={t('monthYearPicker.title')}
      >
        <div className="w-full max-w-none">
          <h2 className="w-full text-lg sm:text-xl font-bold text-gray-800 font-display">
            {t('monthYearPicker.title')}
          </h2>
          <p className="w-full max-w-none text-sm text-gray-600 mt-2 leading-relaxed">
            {t('settings.budgetMonth.tooltip')}
          </p>
          <MonthTransactionCounter count={monthTransactionCount} className="mt-3" />
        </div>

        <div className="mt-4 w-full flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-4">
          <label className="block flex-1 min-w-[140px] sm:max-w-[220px]">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              {t('monthYearPicker.month')}
            </span>
            <select
              value={draftMonth}
              onChange={handleMonthSelect}
              disabled={disabled}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-gray-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {monthNames.map((name, index) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block flex-1 min-w-[120px] sm:max-w-[160px]">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              {t('monthYearPicker.year')}
            </span>
            <select
              value={draftYear}
              onChange={handleYearSelect}
              disabled={disabled}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-gray-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleTodayClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md hover:from-indigo-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:self-end"
          >
            {t('header.today')}
          </button>
        </div>
      </section>

      <ConfirmModal
        isOpen={trimConfirmOpen}
        onClose={handleTrimCancel}
        onConfirm={handleTrimConfirm}
        title={t('monthYearPicker.overflow.title')}
        message={trimMessage}
        confirmButtonText={t('monthYearPicker.overflow.proceed')}
        cancelButtonText={t('monthYearPicker.overflow.cancel')}
      />
    </>
  );
};

export default React.memo(BudgetMonthSection);
