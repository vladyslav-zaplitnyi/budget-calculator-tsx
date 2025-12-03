import React, { useState, useEffect, FormEvent } from 'react';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { Transaction } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => void;
  transaction: Transaction | null;
  isUk: boolean;
  maxTransactions: number;
  selectedCurrencies?: string[];
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  transaction,
  isUk,
  maxTransactions,
  selectedCurrencies = ['UAH', 'USD', 'EUR']
}) => {
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(selectedCurrencies[0] || 'UAH');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (transaction) {
      setType(transaction.type || 'expense');
      setAmount(String(transaction.amount || ''));
      // Якщо валюта транзакції не в обраних валютах, використовуємо першу обрану
      const transactionCurrency = transaction.currency || selectedCurrencies[0] || 'UAH';
      setCurrency(selectedCurrencies.includes(transactionCurrency) ? transactionCurrency : (selectedCurrencies[0] || 'UAH'));
      setDescription(transaction.description || '');
    } else {
      // Скидаємо форму для нової транзакції - використовуємо першу обрану валюту
      setType('expense');
      setAmount('');
      setCurrency(selectedCurrencies[0] || 'UAH');
      setDescription('');
    }
  }, [transaction, isOpen, selectedCurrencies]);

  // Оновлюємо валюту, якщо вона більше не в обраних валютах
  useEffect(() => {
    if (!selectedCurrencies.includes(currency) && selectedCurrencies.length > 0) {
      setCurrency(selectedCurrencies[0]);
    }
  }, [selectedCurrencies, currency]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert(isUk ? 'Введіть коректну суму більше 0' : 'Enter a valid amount greater than 0');
      return;
    }

    if (!description.trim()) {
      alert(isUk ? 'Введіть опис транзакції' : 'Enter transaction description');
      return;
    }

    onSave({
      id: transaction?.id || undefined,
      type,
      amount: numAmount,
      currency: currency.toUpperCase(),
      description: description.trim()
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {transaction
              ? isUk ? 'Редагувати операцію' : 'Edit Transaction'
              : isUk ? 'Додати операцію' : 'Add Transaction'}
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
              {isUk ? 'Тип операції' : 'Transaction Type'}
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
                {isUk ? '❌ Витрата' : '❌ Expense'}
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
                {isUk ? '✅ Дохід' : '✅ Income'}
              </button>
            </div>
          </div>

          {/* Сума */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {isUk ? 'Сума' : 'Amount'}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isUk ? '0.00' : '0.00'}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Валюта */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {isUk ? 'Валюта' : 'Currency'}
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
                    {curr.emoji} {code} ({getCurrencyName(code, isUk ? 'uk' : 'en')})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Опис */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {isUk ? 'Опис' : 'Description'}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isUk ? 'Короткий опис операції...' : 'Short description...'}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              maxLength={100}
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              {isUk ? 'Скасувати' : 'Cancel'}
            </button>
            <button
              type="submit"
              className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
                type === 'income'
                  ? 'bg-emerald-500 hover:bg-emerald-600'
                  : 'bg-rose-500 hover:bg-rose-600'
              }`}
            >
              {isUk ? 'Зберегти' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransactionModal;

