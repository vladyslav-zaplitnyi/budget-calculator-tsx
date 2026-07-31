import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Day, MonthSlice } from '../types';
import { sanitizeNumberInput } from '../utils/calculations';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import { getDefaultOverviewWindow } from '../utils/rollingMonthsBudget';
import { validateMultiMonthBulkAdd } from '../utils/multiMonthBulkTransactions';
import { MAX_TRANSACTIONS_PER_MONTH } from '../utils/transactionLimits';
import type { MultiMonthBulkTransactionDraft } from '../utils/multiMonthBulkTransactions';
import AlertModal from './AlertModal';

export type { MultiMonthBulkTransactionDraft };

interface MultiMonthBulkTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: MultiMonthBulkTransactionDraft) => void;
  monthsByKey: Record<string, MonthSlice> | undefined;
  activeMonthKey: string;
  activeMonthDays: Day[];
  selectedCurrencies: string[];
  isUk: boolean;
}

const DAY_NUMBERS = Array.from({ length: 31 }, (_, i) => i + 1);

const MultiMonthBulkTransactionModal: React.FC<MultiMonthBulkTransactionModalProps> = ({
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

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(selectedCurrencies[0] || 'UAH');
  const [description, setDescription] = useState('');
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
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
    setType('expense');
    setAmount('');
    setCurrency(selectedCurrencies[0] || 'UAH');
    setDescription('');
    setSelectedMonthKeys(new Set());
    setSelectedDays(new Set());
    setShowAlertModal(false);
    setAlertMessage('');
  }, [isOpen, selectedCurrencies]);

  useEffect(() => {
    if (!selectedCurrencies.includes(currency) && selectedCurrencies.length > 0) {
      setCurrency(selectedCurrencies[0]);
    }
  }, [selectedCurrencies, currency]);

  const selectedMonthsSorted = useMemo(
    () => overviewMonths.map((m) => m.key).filter((k) => selectedMonthKeys.has(k)),
    [overviewMonths, selectedMonthKeys]
  );

  const selectedDaysSorted = useMemo(
    () => Array.from(selectedDays).sort((a, b) => a - b),
    [selectedDays]
  );

  const toggleMonth = (key: string) => {
    setSelectedMonthKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const selectAllMonths = () => {
    setSelectedMonthKeys(new Set(overviewMonths.map((m) => m.key)));
  };

  const clearMonths = () => setSelectedMonthKeys(new Set());

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const numAmount = parseFloat(sanitizeNumberInput(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      setAlertMessage(t('transaction.amountError'));
      setShowAlertModal(true);
      return;
    }
    if (!description.trim()) {
      setAlertMessage(t('transaction.descriptionError'));
      setShowAlertModal(true);
      return;
    }
    if (selectedMonthsSorted.length === 0) {
      setAlertMessage(t('multiMonthBulk.selectAtLeastOneMonth'));
      setShowAlertModal(true);
      return;
    }
    if (selectedDaysSorted.length === 0) {
      setAlertMessage(t('bulkTransactions.selectDays'));
      setShowAlertModal(true);
      return;
    }

    const validation = validateMultiMonthBulkAdd(
      selectedMonthsSorted,
      selectedDaysSorted,
      monthsByKey,
      activeMonthKey,
      activeMonthDays,
      MAX_TRANSACTIONS_PER_MONTH
    );

    if (!validation.ok) {
      const lines = validation.errors.map((err) => {
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

    onSave({
      type,
      amount: numAmount,
      currency: currency.toUpperCase(),
      description: description.trim(),
      monthKeys: selectedMonthsSorted,
      days: selectedDaysSorted
    });
    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const totalCreates = selectedMonthsSorted.length * selectedDaysSorted.length;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white w-full h-full sm:h-auto sm:w-full sm:max-w-xl sm:rounded-2xl shadow-2xl p-6 border-0 sm:border-2 border-gray-200 sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl sm:text-xl font-bold text-gray-800">
            {t('transaction.add')}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.type')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
                  type === 'expense'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {t('transaction.expense')}
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all ${
                  type === 'income'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {t('transaction.income')}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.amount')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.currency')}
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('transaction.descriptionPlaceholder')}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              maxLength={100}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                {t('multiMonthBulk.selectMonths')}
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
            <p className="text-[11px] text-gray-500 mb-2">
              {t('multiMonthBulk.monthHint')}
            </p>
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

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('bulkTransactions.selectDays')}
            </label>
            <p className="text-[11px] text-gray-500 mb-2">
              {t('multiMonthBulk.dayHint')}
            </p>
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-3">
              <div className="grid grid-cols-7 gap-2">
                {DAY_NUMBERS.map((dayNumber) => {
                  const isSelected = selectedDays.has(dayNumber);
                  return (
                    <button
                      key={dayNumber}
                      type="button"
                      onClick={() => toggleDay(dayNumber)}
                      className={`h-9 rounded-lg text-sm font-semibold transition-all border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-indigo-50'
                      }`}
                      aria-pressed={isSelected}
                    >
                      {dayNumber}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDaysSorted.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                {t('days.day')}: {selectedDaysSorted.join(', ')}
              </p>
            )}
          </div>

          {totalCreates > 0 && (
            <p className="text-[11px] text-indigo-600 font-semibold">
              {t('multiMonthBulk.willCreateCount', { count: totalCreates })}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300"
            >
              {t('transaction.cancel')}
            </button>
            <button
              type="submit"
              disabled={selectedMonthsSorted.length === 0 || selectedDaysSorted.length === 0}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
                selectedMonthsSorted.length === 0 || selectedDaysSorted.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : type === 'income'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-rose-500 hover:bg-rose-600'
              }`}
            >
              {t('transaction.save')}
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

export default MultiMonthBulkTransactionModal;
