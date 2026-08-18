import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
import { CollectedTransaction, TransactionEditPatch } from '../utils/moveTransactions';
import { sanitizeNumberInput } from '../utils/calculations';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { TRANSACTION_CATEGORIES } from '../utils/categories';
import AlertModal from './AlertModal';

interface DraftRow {
  id: string;
  day: number;
  type: 'income' | 'expense';
  amount: string;
  currency: string;
  description: string;
  category: string;
}

interface BulkEditTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patches: TransactionEditPatch[]) => void;
  items: CollectedTransaction[];
  selectedCurrencies?: string[];
}

const toDraft = (item: CollectedTransaction): DraftRow => ({
  id: item.transaction.id,
  day: item.day,
  type: item.transaction.type || 'expense',
  amount: String(item.transaction.amount ?? ''),
  currency: item.transaction.currency || 'UAH',
  description: item.transaction.description || '',
  category: item.transaction.category || ''
});

const BulkEditTransactionsModal: React.FC<BulkEditTransactionsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  items,
  selectedCurrencies = ['UAH', 'USD', 'EUR']
}) => {
  const { t, i18n } = useTranslation();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDrafts(items.map(toDraft));
    setShowAlertModal(false);
    setAlertMessage('');
  }, [isOpen, items]);

  const currencyOptions = useMemo(() => {
    const codes = new Set(selectedCurrencies);
    drafts.forEach((draft) => {
      if (draft.currency) codes.add(draft.currency);
    });
    return Array.from(codes);
  }, [selectedCurrencies, drafts]);

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const patches: TransactionEditPatch[] = [];
    for (let i = 0; i < drafts.length; i += 1) {
      const row = drafts[i];
      const amount = parseFloat(sanitizeNumberInput(row.amount));
      if (isNaN(amount) || amount <= 0) {
        setAlertMessage(t('moveTransactions.editAmountError', { day: row.day }));
        setShowAlertModal(true);
        return;
      }
      if (!row.description.trim()) {
        setAlertMessage(t('moveTransactions.editDescriptionError', { day: row.day }));
        setShowAlertModal(true);
        return;
      }
      patches.push({
        id: row.id,
        type: row.type,
        amount,
        currency: row.currency.toUpperCase(),
        description: row.description.trim(),
        ...(row.category ? { category: row.category } : {})
      });
    }

    onSave(patches);
    onClose();
  };

  if (!isOpen) return null;

  const language = i18n.language === 'uk' ? 'uk' : 'en';

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 sm:p-6 border-2 border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-800">
            {t('moveTransactions.editTitle', { count: drafts.length })}
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
        <p className="text-sm text-gray-600 mb-4">{t('moveTransactions.editSubtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {drafts.map((row, index) => (
            <div
              key={row.id}
              className="rounded-xl border-2 border-gray-200 bg-gray-50 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
                  {t('days.day')} {row.day}
                </span>
                <span className="text-[11px] font-semibold text-gray-400">#{index + 1}</span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateDraft(row.id, { type: 'expense' })}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-sm font-semibold transition-all ${
                    row.type === 'expense'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {t('transaction.expense')}
                </button>
                <button
                  type="button"
                  onClick={() => updateDraft(row.id, { type: 'income' })}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-sm font-semibold transition-all ${
                    row.type === 'income'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {t('transaction.income')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">
                    {t('transaction.amount')}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(event) => updateDraft(row.id, { amount: event.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-600 mb-1">
                    {t('transaction.currency')}
                  </span>
                  <select
                    value={row.currency}
                    onChange={(event) => updateDraft(row.id, { currency: event.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {currencyOptions.map((code) => {
                      const info = AVAILABLE_CURRENCIES[code];
                      return (
                        <option key={code} value={code}>
                          {info ? `${code} (${getCurrencyName(code, language)})` : code}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {t('transaction.description')}
                </span>
                <input
                  type="text"
                  value={row.description}
                  onChange={(event) => updateDraft(row.id, { description: event.target.value })}
                  placeholder={t('transaction.descriptionPlaceholder')}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  maxLength={100}
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {t('transaction.category')}
                </span>
                <select
                  value={row.category}
                  onChange={(event) => updateDraft(row.id, { category: event.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('transaction.noCategory')}</option>
                  {TRANSACTION_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.emoji} {language === 'uk' ? category.name.uk : category.name.en}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={drafts.length === 0}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-white transition-colors ${
                drafts.length === 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {t('moveTransactions.editSave', { count: drafts.length })}
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

export default BulkEditTransactionsModal;
