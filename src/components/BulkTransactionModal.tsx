import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { sanitizeNumberInput } from '../utils/calculations';
import { Day, Transaction } from '../types';
import { generateTransactionId } from '../utils/dayHelpers';
import AlertModal from './AlertModal';
import {
  buildCalendarCellsForMonthMondayFirst,
  capitalizeFirstLetter,
  getMonthYearLabel,
  getWeekdayLabelsMondayFirst
} from '../utils/dateHelpers';

interface BulkTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  maxTransactions: number;
  selectedCurrencies?: string[];
  budgetYear: number;
  budgetMonth: number;
}

const normalizeStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  if (!value.every(v => typeof v === 'string')) return null;
  return value as string[];
};

const BulkTransactionModal: React.FC<BulkTransactionModalProps> = ({
  isOpen,
  onClose,
  days,
  updateDay,
  maxTransactions,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  budgetYear,
  budgetMonth
}) => {
  const { t, i18n: i18nInstance } = useTranslation();

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(selectedCurrencies[0] || 'UAH');
  const [description, setDescription] = useState('');
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setType('expense');
    setAmount('');
    setCurrency(selectedCurrencies[0] || 'UAH');
    setDescription('');
    setSelectedDays(new Set());
    setShowAlertModal(false);
    setAlertMessage('');
  }, [isOpen, selectedCurrencies]);

  useEffect(() => {
    if (!selectedCurrencies.includes(currency) && selectedCurrencies.length > 0) {
      setCurrency(selectedCurrencies[0]);
    }
  }, [selectedCurrencies, currency]);

  const selectedDaysSorted = useMemo(() => {
    return Array.from(selectedDays).sort((a, b) => a - b);
  }, [selectedDays]);

  const { calendarCells, monthYearLabel, weekdayLabels } = useMemo(() => {
    const year = budgetYear;
    const monthIndex = budgetMonth;
    const locale = i18nInstance.language || 'en';

    const weekdaysFromLocales = normalizeStringArray(
      t('calendar.weekdaysShort', { returnObjects: true })
    );

    const monthsFromLocales = normalizeStringArray(
      t('calendar.monthsLong', { returnObjects: true })
    );

    const weekdayLabelsLocal =
      weekdaysFromLocales && weekdaysFromLocales.length === 7
        ? weekdaysFromLocales
        : getWeekdayLabelsMondayFirst(locale);

    const monthName =
      monthsFromLocales && monthsFromLocales.length === 12
        ? monthsFromLocales[monthIndex]
        : null;

    const monthYearLabelLocal = monthName
      ? capitalizeFirstLetter(t('calendar.monthYear', { month: monthName, year }))
      : getMonthYearLabel(locale, year, monthIndex);

    return {
      calendarCells: buildCalendarCellsForMonthMondayFirst(year, monthIndex),
      monthYearLabel: monthYearLabelLocal,
      weekdayLabels: weekdayLabelsLocal
    };
  }, [budgetYear, budgetMonth, i18nInstance.language, t]);

  const toggleDay = (dayNumber: number) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  const handleSaveBulk = (e: FormEvent) => {
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

    if (selectedDaysSorted.length === 0) {
      setAlertMessage(t('bulkTransactions.selectDays'));
      setShowAlertModal(true);
      return;
    }

    const errorDays: number[] = [];
    selectedDaysSorted.forEach(dayNumber => {
      const idx = dayNumber - 1;
      const day = days[idx];
      const count = Array.isArray(day?.transactions) ? day.transactions.length : 0;
      if (count >= maxTransactions) errorDays.push(dayNumber);
    });

    if (errorDays.length > 0) {
      setAlertMessage(t('bulkTransactions.errorMaxTransactions', { days: errorDays.join(', ') }));
      setShowAlertModal(true);
      return;
    }

    const baseTransaction: Omit<Transaction, 'id'> = {
      type,
      amount: numAmount,
      currency: currency.toUpperCase(),
      description: description.trim()
    };

    selectedDaysSorted.forEach(dayNumber => {
      const idx = dayNumber - 1;
      const day = days[idx];
      const currentTransactions = Array.isArray(day?.transactions) ? [...day.transactions] : [];
      currentTransactions.push({ ...baseTransaction, id: generateTransactionId() });
      updateDay(idx, 'transactions', currentTransactions);
    });

    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

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
            {t('bulkTransactions.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSaveBulk} className="space-y-4">
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
              {selectedCurrencies.map(code => {
                const curr = AVAILABLE_CURRENCIES[code];
                if (!curr) return null;
                return (
                  <option key={code} value={code}>
                    {code} ({getCurrencyName(code, i18nInstance.language === 'uk' ? 'uk' : 'en')})
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('bulkTransactions.selectDays')}
            </label>

            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-center mb-3">
                <div className="text-sm font-semibold text-gray-800">
                  {monthYearLabel}
                </div>
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

                  const dayNumber = cell;
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

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              {t('transaction.cancel')}
            </button>
            <button
              type="submit"
              disabled={selectedDaysSorted.length === 0}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
                selectedDaysSorted.length === 0
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
        buttonText={translate('common.ok')}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BulkTransactionModal;


