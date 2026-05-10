import React, { useEffect, useMemo, useState, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Transaction } from '../types';
import { sanitizeNumberInput } from '../utils/calculations';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import { PlannedMonth } from '../utils/monthlyPlan';
import AlertModal from './AlertModal';

export interface MonthlyPlanTransactionDraft {
  id?: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
}

interface MonthlyPlanTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called once with the new/edited transaction data and the list of month
   * keys it should be applied to. In edit mode `monthKeys` will always
   * contain exactly one entry (the original month).
   */
  onSave: (data: MonthlyPlanTransactionDraft, monthKeys: string[]) => void;
  /** Existing transaction (edit mode) or null (create mode). */
  transaction: Transaction | null;
  /** Months that may be selected as targets for this transaction. */
  selectableMonths: PlannedMonth[];
  /** Initially-checked months when adding a new transaction. */
  defaultSelectedMonthKeys: string[];
  /** When editing, which month key the transaction belongs to (locked). */
  lockedMonthKey?: string | null;
  selectedCurrencies: string[];
  isUk: boolean;
}

const MonthlyPlanTransactionModal: React.FC<MonthlyPlanTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  transaction,
  selectableMonths,
  defaultSelectedMonthKeys,
  lockedMonthKey,
  selectedCurrencies,
  isUk
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = i18nInstance.language || (isUk ? 'uk' : 'en');

  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(selectedCurrencies[0] || 'UAH');
  const [description, setDescription] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const isEditMode = !!transaction;

  useEffect(() => {
    if (!isOpen) return;

    if (transaction) {
      setType(transaction.type || 'expense');
      setAmount(String(transaction.amount ?? ''));
      const txCurrency = transaction.currency || selectedCurrencies[0] || 'UAH';
      setCurrency(selectedCurrencies.includes(txCurrency) ? txCurrency : selectedCurrencies[0] || 'UAH');
      setDescription(transaction.description || '');
      setSelectedKeys(lockedMonthKey ? [lockedMonthKey] : []);
    } else {
      setType('expense');
      setAmount('');
      setCurrency(selectedCurrencies[0] || 'UAH');
      setDescription('');
      const allowed = new Set(selectableMonths.map((m) => m.key));
      setSelectedKeys(defaultSelectedMonthKeys.filter((k) => allowed.has(k)));
    }
  }, [isOpen, transaction, selectableMonths, defaultSelectedMonthKeys, lockedMonthKey, selectedCurrencies]);

  useEffect(() => {
    if (!selectedCurrencies.includes(currency) && selectedCurrencies.length > 0) {
      setCurrency(selectedCurrencies[0]);
    }
  }, [selectedCurrencies, currency]);

  const monthLabels = useMemo(() => {
    const map: Record<string, string> = {};
    selectableMonths.forEach((m) => {
      map[m.key] = capitalizeFirstLetter(getMonthYearLabel(locale, m.year, m.month));
    });
    return map;
  }, [selectableMonths, locale]);

  const toggleMonth = (key: string) => {
    if (isEditMode) return;
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => {
    setSelectedKeys(selectableMonths.map((m) => m.key));
  };

  const clearAll = () => {
    setSelectedKeys([]);
  };

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
    const targets = isEditMode && lockedMonthKey ? [lockedMonthKey] : selectedKeys;
    if (targets.length === 0) {
      setAlertMessage(t('monthlyPlanner.modal.selectAtLeastOne'));
      setShowAlertModal(true);
      return;
    }

    onSave(
      {
        id: transaction?.id,
        type,
        amount: numAmount,
        currency: currency.toUpperCase(),
        description: description.trim()
      },
      targets
    );
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
            {isEditMode ? t('transaction.edit') : t('monthlyPlanner.modal.addTitle')}
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
                {isEditMode
                  ? t('monthlyPlanner.modal.forMonth')
                  : t('monthlyPlanner.modal.forMonths')}
              </label>
              {!isEditMode && (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200"
                  >
                    {t('monthlyPlanner.modal.selectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
                  >
                    {t('monthlyPlanner.modal.clearSelection')}
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              {isEditMode
                ? t('monthlyPlanner.modal.editLockHint')
                : t('monthlyPlanner.modal.multiMonthHint')}
            </p>
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg p-2 border-2 border-indigo-200 max-h-56 overflow-y-auto">
              {selectableMonths.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {t('monthlyPlanner.modal.noSelectableMonths')}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {selectableMonths.map((m) => {
                    const checked = selectedKeys.includes(m.key);
                    const isDisabled = isEditMode && m.key !== lockedMonthKey;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => toggleMonth(m.key)}
                        disabled={isDisabled}
                        className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow'
                            : isDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
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
              )}
            </div>
            {!isEditMode && selectedKeys.length > 1 && (
              <p className="text-[11px] text-indigo-600 mt-1 font-semibold">
                {t('monthlyPlanner.modal.willCreateCount', { count: selectedKeys.length })}
              </p>
            )}
          </div>

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
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
                type === 'income'
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

export default MonthlyPlanTransactionModal;
