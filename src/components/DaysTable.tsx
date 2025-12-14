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
import AlertModal from './AlertModal';
import { generateTransactionId } from '../utils/dayHelpers';
import { Day, ExchangeRates, Transaction } from '../types';
import CurrencyFlag from './CurrencyFlag';
import { capitalizeFirstLetter, getWeekdayShortName, getDaysInMonth } from '../utils/dateHelpers';

interface DaysTableProps {
  isUk: boolean;
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  selectedCurrencies?: string[];
  displayCurrency?: string;
  exchangeRates?: ExchangeRates;
  startBalances?: Record<string, number | null>;
  budgetYear: number;
  budgetMonth: number;
}

const DaysTable: React.FC<DaysTableProps> = ({
  isUk,
  days,
  updateDay,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {},
  startBalances = {},
  budgetYear,
  budgetMonth
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
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const MAX_TRANSACTIONS = 5;
  
  // Отримуємо реальну кількість днів у місяці
  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);
  
  // Фільтруємо дні, щоб показати тільки реальні дні місяця
  const visibleDays = days.slice(0, daysInMonth);

  const handleAddTransaction = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day) return;
    const transactionCount = Array.isArray(day.transactions) ? day.transactions.length : 0;
    
    if (transactionCount >= MAX_TRANSACTIONS) {
      setAlertMessage(translate('transaction.maxTransactions'));
      setShowAlertModal(true);
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
      <div className="table-container overflow-x-auto lg:max-h-[85vh] lg:overflow-y-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 !text-white sticky-table-header">
            <tr>
              <th className="px-3 py-3 text-left font-semibold font-display text-xs sm:text-sm !text-white" rowSpan={2}>
                {translate('days.day')}
              </th>
              <th className="px-3 py-3 text-left font-semibold font-display text-xs sm:text-sm !text-white" rowSpan={2}>
                {translate('days.description')}
              </th>
              {selectedCurrencies.map((currencyCode) => {
                const currency = getCurrencyInfo(currencyCode);
                if (!currency) return null;
                return (
                  <th key={currencyCode} className="px-3 py-3 text-center font-semibold font-display text-xs sm:text-sm border-l border-indigo-400 !text-white" colSpan={4}>
                    <div className="flex items-center justify-center gap-1.5 !text-white">
                      <CurrencyFlag currencyCode={currencyCode} size={18} className="inline-block" />
                      <span className="hidden lg:inline">{getCurrencyName(currencyCode, i18nInstance.language === 'uk' ? 'uk' : 'en')}</span>
                      <span>({currencyCode})</span>
                    </div>
                  </th>
                );
              })}
              <th className="px-3 py-3 text-center font-semibold font-display text-xs sm:text-sm border-l border-indigo-400 !text-white" colSpan={4}>
                <div className="flex items-center justify-center gap-1.5 !text-white">
                  <CurrencyFlag currencyCode={displayCurrency} size={18} className="inline-block" />
                  <span>{displayCurrency}</span>
                  <span className="hidden lg:inline">{translate('days.converted')}</span>
                </div>
              </th>
            </tr>
            <tr>
              {selectedCurrencies.map((currencyCode, idx) => (
                <React.Fragment key={currencyCode}>
                  <th className={`px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white ${idx === 0 ? 'border-l border-indigo-400' : 'border-l border-indigo-400'}`}>
                    <span className="hidden sm:inline">{translate('days.income')}</span>
                    <span className="sm:hidden">✅</span>
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                    <span className="hidden sm:inline">{translate('days.expenses')}</span>
                    <span className="sm:hidden">❌</span>
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                    <span className="hidden lg:inline">{translate('days.balance')}</span>
                    <span className="lg:hidden">Δ</span>
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                    <span className="hidden lg:inline">{translate('days.cumulativeShort')}</span>
                    <span className="lg:hidden">Σ</span>
                  </th>
                </React.Fragment>
              ))}
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium border-l border-indigo-400 !text-white">
                <span className="hidden sm:inline">{translate('days.income')}</span>
                <span className="sm:hidden">✅</span>
              </th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                <span className="hidden sm:inline">{translate('days.expenses')}</span>
                <span className="sm:hidden">❌</span>
              </th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                <span className="hidden lg:inline">{translate('days.balance')}</span>
                <span className="lg:hidden">Δ</span>
              </th>
              <th className="px-2 py-2 text-right text-[10px] sm:text-xs font-medium !text-white">
                <span className="hidden lg:inline">{translate('days.cumulativeShort')}</span>
                <span className="lg:hidden">Σ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {visibleDays.map((day, index) => {
              if (!day) return null;
              const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
              const weekday = getWeekdayShortName(
                budgetYear,
                budgetMonth,
                day.day,
                i18nInstance.language || 'en'
              );
              
              const transactions = Array.isArray(day.transactions) ? day.transactions : [];
              const transactionCount = transactions.length;
              const canAddMore = transactionCount < MAX_TRANSACTIONS;

              return (
                <tr 
                  key={day.day} 
                  className={`transition-colors border-b border-gray-100 hover:bg-blue-100 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-sky-100'
                  }`}
                >
                  <td className="px-3 py-3 font-bold text-gray-900 font-display text-sm whitespace-nowrap text-center">
                    <div className="flex flex-col items-center">
                      <span
                        className="inline-block py-1 px-2.5 rounded-lg bg-indigo-600 !text-white select-none"
                        style={{ border: '2px solid #4f46e5', boxShadow: '0 1px 3px rgba(79, 70, 229, 0.3)' }}
                      >
                        {day.day}
                      </span>
                      <span className="text-[14px] uppercase text-gray-500 mt-1">
                        {capitalizeFirstLetter(weekday)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 min-w-[200px] max-w-[300px]">
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
                          className="w-full px-2 py-1 text-xs bg-blue-500 !text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
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
                        <td className={`px-2 py-3 text-right text-xs tabular-nums ${currencyIdx === 0 ? 'border-l-2 border-gray-200' : 'border-l border-gray-100'} ${income > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                          {income > 0 ? income.toFixed(2) : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs tabular-nums ${expense > 0 ? 'text-rose-600 font-medium' : 'text-gray-400'}`}>
                          {expense > 0 ? expense.toFixed(2) : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs font-semibold tabular-nums ${
                          dayBalance > 0 ? 'text-emerald-600 bg-emerald-50/50' : dayBalance < 0 ? 'text-rose-600 bg-rose-50/50' : 'text-gray-600'
                        }`}>
                          {dayBalance !== 0 ? dayBalance.toFixed(2) : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs font-bold tabular-nums ${
                          cumulative >= (parseFloat(String(startBalance)) || 0) ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                        }`}>
                          {cumulative !== 0 ? cumulative.toFixed(2) : ''}
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
                        <td className={`px-2 py-3 border-l-2 border-indigo-200 text-right text-xs tabular-nums bg-indigo-50/80 ${convertedIncome > 0 ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                          {convertedIncome > 0 ? convertedIncome.toFixed(2) : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs tabular-nums bg-indigo-50/80 ${convertedExpense > 0 ? 'text-rose-700 font-medium' : 'text-gray-400'}`}>
                          {convertedExpense > 0 ? convertedExpense.toFixed(2) : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs font-semibold tabular-nums bg-indigo-100/60 ${
                          convertedDayBalance > 0 ? 'text-emerald-700' : convertedDayBalance < 0 ? 'text-rose-700' : 'text-gray-700'
                        }`}>
                          {convertedDayBalance !== 0 ? `${displaySymbol}${convertedDayBalance.toFixed(2)}` : ''}
                        </td>
                        <td className={`px-2 py-3 text-right text-xs font-bold tabular-nums bg-indigo-100 ${
                          convertedCumulative >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}>
                          {convertedCumulative !== 0 ? `${displaySymbol}${convertedCumulative.toFixed(2)}` : ''}
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
      
      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        message={alertMessage}
        type="warning"
        buttonText={translate('common.ok')}
      />
    </div>
  );
};

export default React.memo(DaysTable);

