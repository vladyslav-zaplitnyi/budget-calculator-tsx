import React, { useState, useEffect, FormEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { Transaction } from '../types';
import AlertModal from './AlertModal';
import { 
  getMonthYearLabel, 
  buildCalendarCellsForMonthMondayFirst, 
  getWeekdayLabelsMondayFirst,
  capitalizeFirstLetter 
} from '../utils/dateHelpers';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => void;
  transaction: Transaction | null;
  isUk: boolean;
  maxTransactions: number;
  selectedCurrencies?: string[];
  currentBudgetYear: number;
  currentBudgetMonth: number;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  transaction,
  isUk,
  maxTransactions,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  currentBudgetYear,
  currentBudgetMonth
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(selectedCurrencies[0] || 'UAH');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Генеруємо календар для обраного місяця
  const { calendarCells, monthYearLabel, weekdayLabels } = useMemo(() => {
    const locale = i18nInstance.language || 'en';
    const monthYearLabelLocal = getMonthYearLabel(locale, currentBudgetYear, currentBudgetMonth);
    const weekdayLabelsLocal = getWeekdayLabelsMondayFirst(locale);
    const calendarCellsLocal = buildCalendarCellsForMonthMondayFirst(currentBudgetYear, currentBudgetMonth);

    return {
      calendarCells: calendarCellsLocal,
      monthYearLabel: monthYearLabelLocal,
      weekdayLabels: weekdayLabelsLocal
    };
  }, [currentBudgetYear, currentBudgetMonth, i18nInstance.language, isOpen]);

  useEffect(() => {
    // Спрацьовує тільки коли модалка відкривається
    if (!isOpen) return;
    
    if (transaction) {
      setType(transaction.type || 'expense');
      setAmount(String(transaction.amount || ''));
      // Якщо валюта транзакції не в обраних валютах, використовуємо першу обрану
      const transactionCurrency = transaction.currency || selectedCurrencies[0] || 'UAH';
      setCurrency(selectedCurrencies.includes(transactionCurrency) ? transactionCurrency : (selectedCurrencies[0] || 'UAH'));
      setDescription(transaction.description || '');
      // Встановлюємо дату з існуючої транзакції або поточну
      if (transaction.date) {
        const transactionDate = typeof transaction.date === 'string' ? new Date(transaction.date) : transaction.date;
        setDate(transactionDate);
        setSelectedDay(transactionDate.getDate());
      } else {
        const defaultDate = new Date();
        setDate(defaultDate);
        setSelectedDay(defaultDate.getDate());
      }
    } else {
      // Скидаємо форму для нової транзакції - використовуємо першу обрану валюту
      setType('expense');
      setAmount('');
      setCurrency(selectedCurrencies[0] || 'UAH');
      setDescription('');
      
      // Smart Date Initialization для нової транзакції
      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth(); // 0-indexed (0 = January, 11 = December)
      
      // Перевіряємо, чи поточна дата знаходиться в межах обраного бюджетного місяця
      const isCurrentBudgetMonth = nowYear === currentBudgetYear && nowMonth === currentBudgetMonth;
      
      if (isCurrentBudgetMonth) {
        // Якщо це поточний місяць - використовуємо поточну дату/час
        setDate(now);
        setSelectedDay(now.getDate());
      } else {
        // Якщо це історичний або майбутній місяць - встановлюємо на 1-ше число о 12:00
        const initialDate = new Date(currentBudgetYear, currentBudgetMonth, 1, 12, 0, 0);
        setDate(initialDate);
        setSelectedDay(1);
      }
    }
  }, [transaction, isOpen, selectedCurrencies, currentBudgetYear, currentBudgetMonth]);

  // Оновлюємо валюту, якщо вона більше не в обраних валютах
  useEffect(() => {
    if (!selectedCurrencies.includes(currency) && selectedCurrencies.length > 0) {
      setCurrency(selectedCurrencies[0]);
    }
  }, [selectedCurrencies, currency]);

  // Обробник вибору дня
  const handleDaySelect = (day: number) => {
    setSelectedDay(day);
    // Оновлюємо дату, зберігаючи час
    const newDate = new Date(date);
    newDate.setFullYear(currentBudgetYear);
    newDate.setMonth(currentBudgetMonth);
    newDate.setDate(day);
    setDate(newDate);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    const numAmount = parseFloat(amount);
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

    onSave({
      id: transaction?.id || undefined,
      type,
      amount: numAmount,
      currency: currency.toUpperCase(),
      description: description.trim(),
      date: date
    });

    // Закриваємо модальне вікно
    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {transaction
              ? t('transaction.edit')
              : t('transaction.add')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Тип транзакції */}
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

          {/* Сума */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.amount')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Валюта */}
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

          {/* Опис */}
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

          {/* Вибір дати */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transaction.date') || 'Дата'}
            </label>
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-3 border-2 border-indigo-200">
              {/* Заголовок місяця */}
              <div className="text-center mb-2 font-bold text-indigo-700">
                {capitalizeFirstLetter(monthYearLabel)}
              </div>
              
              {/* Дні тижня */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekdayLabels.map((label, idx) => (
                  <div key={idx} className="text-center text-xs font-semibold text-gray-600 uppercase">
                    {label.substring(0, 2)}
                  </div>
                ))}
              </div>
              
              {/* Календар днів */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, idx) => {
                  if (cell === null) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }
                  const dayNumber = cell;
                  const isSelected = dayNumber === selectedDay;
                  return (
                    <button
                      key={dayNumber}
                      type="button"
                      onClick={() => handleDaySelect(dayNumber)}
                      className={`aspect-square rounded-lg text-sm font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md scale-105'
                          : 'bg-white text-gray-700 hover:bg-indigo-100 hover:scale-105'
                      }`}
                    >
                      {dayNumber}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Кнопки */}
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
        buttonText={translate('common.ok')}
      />
    </div>
  );
};

export default TransactionModal;

