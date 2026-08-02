import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Day, MonthSlice } from '../types';
import { sanitizeNumberInput, formatNumber } from '../utils/calculations';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import {
  buildForecastCandidates,
  buildForecastFingerprint,
  validateForecastCopy,
  type ForecastCandidate,
  type ForecastCopyDraft,
  type ForecastCopyItem
} from '../utils/budgetForecast';
import { MAX_TRANSACTIONS_PER_MONTH } from '../utils/transactionLimits';
import AlertModal from './AlertModal';

interface EditableRow extends ForecastCopyItem {
  /** Stable UI key (original fingerprint). */
  rowId: string;
  selected: boolean;
  isRecurring: boolean;
  monthCount: number;
  editing: boolean;
}

interface BudgetForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: ForecastCopyDraft) => void;
  monthsByKey: Record<string, MonthSlice> | undefined;
  activeMonthKey: string;
  activeMonthDays: Day[];
  selectedCurrencies: string[];
  isUk: boolean;
}

function candidateToRow(c: ForecastCandidate, selected: boolean): EditableRow {
  return {
    rowId: c.id,
    fingerprint: c.fingerprint,
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    description: c.description,
    category: c.category,
    day: c.day,
    selected,
    isRecurring: c.isRecurring,
    monthCount: c.monthKeys.length,
    editing: false
  };
}

const BudgetForecastModal: React.FC<BudgetForecastModalProps> = ({
  isOpen,
  onClose,
  onSave,
  monthsByKey,
  activeMonthKey,
  activeMonthDays,
  selectedCurrencies,
  isUk
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = i18nInstance.language || (isUk ? 'uk' : 'en');

  const [selectedMonthKeys, setSelectedMonthKeys] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const overviewMonths = useMemo(() => getDefaultOverviewWindow(), []);

  const monthLabels = useMemo(() => {
    const map: Record<string, string> = {};
    overviewMonths.forEach((m) => {
      map[m.key] = capitalizeFirstLetter(getMonthYearLabel(locale, m.year, m.month));
    });
    return map;
  }, [overviewMonths, locale]);

  useEffect(() => {
    if (!isOpen) return;

    const groups = buildForecastCandidates(monthsByKey, activeMonthKey || null, activeMonthDays);
    const nextRows = [
      ...groups.recurring.map((c) => candidateToRow(c, true)),
      ...groups.unique.map((c) => candidateToRow(c, false))
    ];
    setRows(nextRows);
    setSelectedMonthKeys(new Set());
    setShowAlertModal(false);
    setAlertMessage('');
  }, [isOpen, monthsByKey, activeMonthKey, activeMonthDays]);

  const selectedMonthsSorted = useMemo(
    () => overviewMonths.map((m) => m.key).filter((k) => selectedMonthKeys.has(k)),
    [overviewMonths, selectedMonthKeys]
  );

  const recurringRows = useMemo(() => rows.filter((r) => r.isRecurring), [rows]);
  const uniqueRows = useMemo(() => rows.filter((r) => !r.isRecurring), [rows]);
  const selectedItems = useMemo(() => rows.filter((r) => r.selected), [rows]);

  const preview = useMemo(() => {
    if (selectedMonthsSorted.length === 0 || selectedItems.length === 0) {
      return { createCount: 0, skipCount: 0, ok: true, errors: [] as ReturnType<typeof validateForecastCopy>['errors'] };
    }
    const draft: ForecastCopyDraft = {
      monthKeys: selectedMonthsSorted,
      items: selectedItems.map(({ fingerprint, type, amount, currency, description, category, day }) => ({
        fingerprint,
        type,
        amount,
        currency,
        description,
        category,
        day
      }))
    };
    const result = validateForecastCopy(
      draft,
      monthsByKey,
      activeMonthKey || null,
      activeMonthDays,
      MAX_TRANSACTIONS_PER_MONTH
    );
    const skipCount = result.plan.filter((p) => p.skippedExisting).length;
    return {
      createCount: result.createCount,
      skipCount,
      ok: result.ok,
      errors: result.errors
    };
  }, [selectedMonthsSorted, selectedItems, monthsByKey, activeMonthKey, activeMonthDays]);

  const toggleMonth = (key: string) => {
    setSelectedMonthKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllMonths = () => {
    setSelectedMonthKeys(new Set(overviewMonths.map((m) => m.key)));
  };

  const clearMonths = () => setSelectedMonthKeys(new Set());

  const updateRow = (rowId: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const toggleSelected = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectAllInGroup = (recurring: boolean, selected: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.isRecurring === recurring ? { ...r, selected } : r))
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (selectedMonthsSorted.length === 0) {
      setAlertMessage(t('budgetForecast.selectAtLeastOneMonth'));
      setShowAlertModal(true);
      return;
    }
    if (selectedItems.length === 0) {
      setAlertMessage(t('budgetForecast.selectAtLeastOneTx'));
      setShowAlertModal(true);
      return;
    }

    for (const item of selectedItems) {
      if (!item.description.trim()) {
        setAlertMessage(t('transaction.descriptionError'));
        setShowAlertModal(true);
        return;
      }
      if (!item.amount || item.amount <= 0 || Number.isNaN(item.amount)) {
        setAlertMessage(t('transaction.amountError'));
        setShowAlertModal(true);
        return;
      }
      if (item.day < 1 || item.day > 31) {
        setAlertMessage(t('budgetForecast.dayError'));
        setShowAlertModal(true);
        return;
      }
    }

    if (!preview.ok) {
      const lines = preview.errors.map((err) => {
        const label = monthLabels[err.monthKey] || err.monthKey;
        return t('multiMonthBulk.errorMonthLimit', {
          month: label,
          existing: err.existing,
          adding: err.adding,
          max: err.max
        });
      });
      setAlertMessage([t('transactionLimit.batchBlocked'), ...lines].join('\n'));
      setShowAlertModal(true);
      return;
    }

    if (preview.createCount === 0) {
      setAlertMessage(t('budgetForecast.nothingToAdd'));
      setShowAlertModal(true);
      return;
    }

    const items: ForecastCopyItem[] = selectedItems.map((item) => {
      const description = item.description.trim();
      return {
        fingerprint: buildForecastFingerprint(
          item.type,
          item.currency,
          description,
          item.day
        ),
        type: item.type,
        amount: item.amount,
        currency: item.currency.toUpperCase(),
        description,
        category: item.category,
        day: item.day
      };
    });

    onSave({ monthKeys: selectedMonthsSorted, items });
    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const renderRow = (row: EditableRow) => {
    const amountLabel = `${formatNumber(row.amount)} ${row.currency}`;
    return (
      <div
        key={row.rowId}
        className={`rounded-xl border-2 p-3 transition-colors ${
          row.selected
            ? 'border-indigo-400 bg-indigo-50/60'
            : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={row.selected}
            onChange={() => toggleSelected(row.rowId)}
            className="mt-1 h-4 w-4 accent-indigo-600"
            aria-label={t('budgetForecast.selectTx')}
          />
          <div className="flex-1 min-w-0">
            {!row.editing ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      row.type === 'income'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {row.type === 'income' ? t('transaction.income') : t('transaction.expense')}
                  </span>
                  <span className="font-semibold text-gray-800 truncate">{row.description}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {amountLabel}
                  <span className="mx-1.5 text-gray-300">·</span>
                  {t('days.day')} {row.day}
                  <span className="mx-1.5 text-gray-300">·</span>
                  {t('budgetForecast.seenInMonths', { count: row.monthCount })}
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateRow(row.rowId, { type: 'expense' })}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold ${
                      row.type === 'expense'
                        ? 'bg-rose-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {t('transaction.expense')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRow(row.rowId, { type: 'income' })}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold ${
                      row.type === 'income'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {t('transaction.income')}
                  </button>
                </div>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateRow(row.rowId, { description: e.target.value })}
                  className="w-full px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
                  maxLength={100}
                  placeholder={t('transaction.descriptionPlaceholder')}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(row.amount)}
                    onChange={(e) => {
                      const n = parseFloat(sanitizeNumberInput(e.target.value));
                      updateRow(row.rowId, { amount: Number.isNaN(n) ? 0 : n });
                    }}
                    className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
                    aria-label={t('transaction.amount')}
                  />
                  <select
                    value={row.currency}
                    onChange={(e) => updateRow(row.rowId, { currency: e.target.value })}
                    className="px-2 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
                    aria-label={t('transaction.currency')}
                  >
                    {selectedCurrencies.map((code) => {
                      const curr = AVAILABLE_CURRENCIES[code];
                      if (!curr) return null;
                      return (
                        <option key={code} value={code}>
                          {code} ({getCurrencyName(code, isUk ? 'uk' : 'en')})
                        </option>
                      );
                    })}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={row.day}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      updateRow(row.rowId, {
                        day: Number.isNaN(n) ? 1 : Math.min(31, Math.max(1, n))
                      });
                    }}
                    className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm"
                    aria-label={t('days.day')}
                  />
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => updateRow(row.rowId, { editing: !row.editing })}
            className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {row.editing ? t('common.done') : t('budgetForecast.edit')}
          </button>
        </div>
      </div>
    );
  };

  const renderGroup = (
    title: string,
    hint: string,
    groupRows: EditableRow[],
    recurring: boolean,
    listMaxHeightClass: string
  ) => (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-800">
            {title}
            {groupRows.length > 0 && (
              <span className="ml-2 font-semibold text-gray-500">({groupRows.length})</span>
            )}
          </h3>
          <p className="text-[11px] text-gray-500">{hint}</p>
        </div>
        {groupRows.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => selectAllInGroup(recurring, true)}
              className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200"
            >
              {t('monthlyPlanner.modal.selectAll')}
            </button>
            <button
              type="button"
              onClick={() => selectAllInGroup(recurring, false)}
              className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
            >
              {t('monthlyPlanner.modal.clearSelection')}
            </button>
          </div>
        )}
      </div>
      {groupRows.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-2">{t('budgetForecast.emptyGroup')}</p>
      ) : (
        <div className={`space-y-2 ${listMaxHeightClass} overflow-y-auto pr-1`}>
          {groupRows.map(renderRow)}
        </div>
      )}
    </div>
  );

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white w-full h-full sm:h-auto sm:w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl p-6 border-0 sm:border-2 border-gray-200 sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl sm:text-xl font-bold text-gray-800">
            {t('budgetForecast.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{t('budgetForecast.subtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                {t('budgetForecast.selectTargetMonths')}
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllMonths}
                  className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200"
                >
                  {t('monthlyPlanner.modal.selectAll')}
                </button>
                <button
                  type="button"
                  onClick={clearMonths}
                  className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                >
                  {t('monthlyPlanner.modal.clearSelection')}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">{t('budgetForecast.monthHint')}</p>
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg p-2 border-2 border-indigo-200 max-h-40 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {overviewMonths.map((m) => {
                  const checked = selectedMonthKeys.has(m.key);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggleMonth(m.key)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        checked
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-indigo-100'
                      }`}
                      aria-pressed={checked}
                    >
                      {checked && <span aria-hidden>✓ </span>}
                      {monthLabels[m.key]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {renderGroup(
            t('budgetForecast.recurringTitle'),
            t('budgetForecast.recurringHint'),
            recurringRows,
            true,
            'max-h-48'
          )}

          {renderGroup(
            t('budgetForecast.uniqueTitle'),
            t('budgetForecast.uniqueHint'),
            uniqueRows,
            false,
            'max-h-80'
          )}

          {(preview.createCount > 0 || preview.skipCount > 0) && (
            <p className="text-[11px] text-indigo-600 font-semibold">
              {t('budgetForecast.willCreateCount', { count: preview.createCount })}
              {preview.skipCount > 0 && (
                <> {t('budgetForecast.willSkipCount', { count: preview.skipCount })}</>
              )}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300"
            >
              {t('transaction.cancel')}
            </button>
            <button
              type="submit"
              disabled={
                selectedMonthsSorted.length === 0 ||
                selectedItems.length === 0 ||
                preview.createCount === 0
              }
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
                selectedMonthsSorted.length === 0 ||
                selectedItems.length === 0 ||
                preview.createCount === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {t('budgetForecast.apply')}
            </button>
          </div>
        </form>
      </div>

      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        message={alertMessage}
        type="error"
        buttonText={t('common.ok')}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BudgetForecastModal;
