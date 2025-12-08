import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  calculateDayBalance,
  calculateCumulativeBalance,
  calculateDayAmountsFromTransactions,
  convertCurrency
} from '../utils/calculations';
import { getCurrencyInfo, getCurrencySymbol, getCurrencyName } from '../utils/currencies';
import TransactionModal from './TransactionModal';
import { generateTransactionId } from '../utils/dayHelpers';
import { Day, ExchangeRates, Transaction } from '../types';
import CurrencyFlag from './CurrencyFlag';

interface DaysTableProps {
  isUk: boolean;
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  selectedCurrencies?: string[];
  displayCurrency?: string;
  exchangeRates?: ExchangeRates;
  startBalances?: Record<string, number | null>;
}

const DaysTable: React.FC<DaysTableProps> = ({
  isUk,
  days,
  updateDay,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {},
  startBalances = {}
}) => {
  const { t: translate, i18n: i18nInstance } = useTranslation();
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    dayIndex: number | null;
    transaction: Transaction | null;
  }>({
    isOpen: false,
    dayIndex: null,
    transaction: null
  });

  const MAX_TRANSACTIONS = 5;

  const handleAddTransaction = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day) return;
    const transactionCount = Array.isArray(day.transactions) ? day.transactions.length : 0;
    
    if (transactionCount >= MAX_TRANSACTIONS) {
      alert(translate('transaction.maxTransactions'));
      return;
    }

    setModalState({
      isOpen: true,
      dayIndex,
      transaction: null
    });
  };

  const handleEditTransaction = (dayIndex: number, transaction: Transaction) => {
    setModalState({
      isOpen: true,
      dayIndex,
      transaction
    });
  };

  const handleDeleteTransaction = (dayIndex: number, transactionId: string) => {
    const day = days[dayIndex];
    if (!day) return;
    const updatedTransactions = (day.transactions || []).filter(t => t.id !== transactionId);
    updateDay(dayIndex, 'transactions', updatedTransactions);
  };

  const handleSaveTransaction = (transactionData: Partial<Transaction>) => {
    const { dayIndex, transaction: existingTransaction } = modalState;
    if (dayIndex === null) return;

    const day = days[dayIndex];
    if (!day) return;
    const currentTransactions = Array.isArray(day.transactions) ? [...day.transactions] : [];

    if (existingTransaction && existingTransaction.id) {
      // Редагуємо існуючу транзакцію
      const index = currentTransactions.findIndex(t => t.id === existingTransaction.id);
      if (index !== -1) {
        currentTransactions[index] = {
          ...transactionData,
          id: existingTransaction.id // Зберігаємо оригінальний ID
        } as Transaction;
      }
    } else {
      // Додаємо нову транзакцію
      currentTransactions.push({
        ...transactionData,
        id: transactionData.id || generateTransactionId()
      } as Transaction);
    }

    updateDay(dayIndex, 'transactions', currentTransactions);
    setModalState({ isOpen: false, dayIndex: null, transaction: null });
  };

  const getTransactionChips = (day: Day | null | undefined) => {
    if (!day) return null;
    const transactions = Array.isArray(day.transactions) ? day.transactions : [];
    if (transactions.length === 0) return null;

    const emojiMap: Record<string, string> = {
      'expense': '❌',
      'income': '✅'
    };

    return transactions.slice(0, 3).map((t, idx) => (
      <span
        key={t.id || idx}
        className={`inline-block px-2 py-1 text-xs rounded-full mr-1 mb-1 ${
          t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}
        title={`${t.amount} ${t.currency}: ${t.description}`}
      >
        {emojiMap[t.type] || '•'} {t.description.length > 15 ? t.description.substring(0, 15) + '...' : t.description}
      </span>
    ));
  };

  return (
    <div className="hidden md:block bg-white rounded-2xl shadow-xl overflow-hidden mb-4 sm:mb-6">
      <div className="overflow-x-auto lg:max-h-[85vh] lg:overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white sticky-table-header">
            <tr>
              <th className="px-3 py-3 text-left font-semibold" rowSpan={2}>
                {translate('days.day')}
              </th>
              <th className="px-3 py-3 text-left font-semibold" rowSpan={2}>
                {translate('days.description')}
              </th>
              {selectedCurrencies.map((currencyCode) => {
                const currency = getCurrencyInfo(currencyCode);
                if (!currency) return null;
                return (
                  <th key={currencyCode} className="px-3 py-3 text-center font-semibold border-l border-indigo-400" colSpan={4}>
                    <CurrencyFlag currencyCode={currencyCode} size={18} className="mr-1" /> {getCurrencyName(currencyCode, i18nInstance.language === 'uk' ? 'uk' : 'en')} ({currencyCode})
                  </th>
                );
              })}
              <th className="px-3 py-3 text-center font-semibold border-l border-indigo-400 bg-indigo-100" colSpan={4}>
                <CurrencyFlag currencyCode={displayCurrency} size={18} className="mr-1" /> {displayCurrency} {translate('days.converted')}
              </th>
            </tr>
            <tr>
              {selectedCurrencies.map((currencyCode, idx) => (
                <React.Fragment key={currencyCode}>
                  <th className={`px-2 py-2 text-right text-xs ${idx === 0 ? 'border-l border-indigo-400' : 'border-l border-indigo-400'}`}>
                    {translate('days.income')}
                  </th>
                  <th className="px-2 py-2 text-right text-xs">
                    {translate('days.expenses')}
                  </th>
                  <th className="px-2 py-2 text-right text-xs">
                    {translate('days.balance')}
                  </th>
                  <th className="px-2 py-2 text-right text-xs">
                    {translate('days.cumulativeShort')}
                  </th>
                </React.Fragment>
              ))}
              <th className="px-2 py-2 text-right text-xs border-l border-indigo-400 bg-indigo-50">
                {translate('days.income')}
              </th>
              <th className="px-2 py-2 text-right text-xs bg-indigo-50">
                {translate('days.expenses')}
              </th>
              <th className="px-2 py-2 text-right text-xs bg-indigo-50">
                {translate('days.balance')}
              </th>
              <th className="px-2 py-2 text-right text-xs bg-indigo-50">
                {translate('days.cumulativeShort')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {days.map((day, index) => {
              if (!day) return null;
              const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
              
              const transactions = Array.isArray(day.transactions) ? day.transactions : [];
              const transactionCount = transactions.length;
              const canAddMore = transactionCount < MAX_TRANSACTIONS;

              return (
                <tr key={day.day} className="hover:bg-blue-50 transition-colors">
                  <td className="px-3 py-2 font-bold text-gray-900">
                    {day.day}
                  </td>
                  <td className="px-3 py-2 min-w-[200px]">
                    <div className="space-y-2">
                      {/* Чіпси з транзакціями */}
                      <div className="flex flex-wrap gap-1">
                        {getTransactionChips(day)}
                        {transactionCount > 3 && (
                          <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                            +{transactionCount - 3}
                          </span>
                        )}
                      </div>
                      
                      {/* Кнопка додавання транзакції */}
                      {canAddMore ? (
                        <button
                          onClick={() => handleAddTransaction(index)}
                          className="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                        >
                          {translate('days.addTransaction')}
                        </button>
                      ) : (
                        <div className="w-full px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded-lg text-center">
                          {translate('transaction.maxTransactionsShort')}
                        </div>
                      )}
                      
                      {/* Список транзакцій для редагування */}
                      {transactions.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {transactions.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between text-xs bg-gray-50 p-1 rounded"
                            >
                              <span className="flex-1 truncate">
                                {t.type === 'income' ? '✅' : '❌'} {t.amount} {t.currency}: {t.description}
                              </span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleEditTransaction(index, t)}
                                  className="text-blue-600 hover:text-blue-800"
                                  title={translate('transaction.edit')}
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteTransaction(index, t.id)}
                                  className="text-red-600 hover:text-red-800"
                                  title={translate('transaction.delete')}
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Dynamic currency columns */}
                  {selectedCurrencies.map((currencyCode, currencyIdx) => {
                    const currency = getCurrencyInfo(currencyCode);
                    if (!currency) return null;
                    
                    const dayBalance = calculateDayBalance(day, currencyCode);
                    const startBalance = startBalances[currencyCode] ?? null;
                    const cumulative = calculateCumulativeBalance(index, days, startBalance, currencyCode);
                    const incomeKey = `income${currencyCode}`;
                    const expenseKey = `expense${currencyCode}`;
                    const income = amounts[incomeKey] || 0;
                    const expense = amounts[expenseKey] || 0;
                    
                    return (
                      <React.Fragment key={currencyCode}>
                        <td className={`px-2 py-2 text-right text-xs ${currencyIdx === 0 ? 'border-l border-gray-200' : 'border-l border-gray-200'}`}>
                          {income > 0 ? income.toFixed(2) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right text-xs">
                          {expense > 0 ? expense.toFixed(2) : '-'}
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold ${
                          dayBalance > 0 ? 'text-emerald-600' : dayBalance < 0 ? 'text-rose-600' : 'text-gray-600'
                        }`}>
                          {dayBalance.toFixed(2)}
                        </td>
                        <td className={`px-2 py-2 text-right font-bold ${
                          cumulative >= (parseFloat(String(startBalance)) || 0) ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {cumulative.toFixed(2)}
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Converted to Display Currency columns */}
                  {(() => {
                    const displaySymbol = getCurrencySymbol(displayCurrency);
                    // Конвертуємо надбавки та витрати з усіх обраних валют
                    let convertedIncome = 0;
                    let convertedExpense = 0;
                    let convertedDayBalance = 0;
                    let convertedCumulative = 0;
                    
                    selectedCurrencies.forEach(currencyCode => {
                      const incomeKey = `income${currencyCode}`;
                      const expenseKey = `expense${currencyCode}`;
                      const income = amounts[incomeKey] || 0;
                      const expense = amounts[expenseKey] || 0;
                      const dayBalance = calculateDayBalance(day, currencyCode);
                    const startBalance = startBalances[currencyCode] ?? null;
                      const cumulative = calculateCumulativeBalance(index, days, startBalance, currencyCode);
                      
                      convertedIncome += convertCurrency(income, currencyCode, displayCurrency, exchangeRates);
                      convertedExpense += convertCurrency(expense, currencyCode, displayCurrency, exchangeRates);
                      convertedDayBalance += convertCurrency(dayBalance, currencyCode, displayCurrency, exchangeRates);
                      convertedCumulative += convertCurrency(cumulative, currencyCode, displayCurrency, exchangeRates);
                    });
                    
                    return (
                      <>
                        <td className="px-2 py-2 border-l border-gray-200 text-right text-xs bg-indigo-50">
                          {convertedIncome > 0 ? convertedIncome.toFixed(2) : '-'}
                        </td>
                        <td className="px-2 py-2 text-right text-xs bg-indigo-50">
                          {convertedExpense > 0 ? convertedExpense.toFixed(2) : '-'}
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold bg-indigo-50 ${
                          convertedDayBalance > 0 ? 'text-emerald-600' : convertedDayBalance < 0 ? 'text-rose-600' : 'text-gray-600'
                        }`}>
                          {displaySymbol}{convertedDayBalance.toFixed(2)}
                        </td>
                        <td className={`px-2 py-2 text-right font-bold bg-indigo-50 ${
                          convertedCumulative >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {displaySymbol}{convertedCumulative.toFixed(2)}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <TransactionModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, dayIndex: null, transaction: null })}
        onSave={handleSaveTransaction}
        transaction={modalState.transaction}
        isUk={isUk}
        maxTransactions={MAX_TRANSACTIONS}
        selectedCurrencies={selectedCurrencies}
      />
    </div>
  );
};

export default React.memo(DaysTable);

