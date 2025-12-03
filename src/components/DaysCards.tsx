import React, { useState } from 'react';
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

interface DaysCardsProps {
  isUk: boolean;
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  startBalanceUAH: number | null;
  startBalanceUSD: number | null;
  startBalanceEUR: number | null;
  selectedCurrencies?: string[];
  displayCurrency?: string;
  exchangeRates?: ExchangeRates;
  startBalances?: Record<string, number | null>;
}

const DaysCards: React.FC<DaysCardsProps> = ({
  isUk,
  days,
  updateDay,
  startBalanceUAH,
  startBalanceUSD,
  startBalanceEUR,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  displayCurrency = 'UAH',
  exchangeRates = {},
  startBalances = {}
}) => {
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
    const transactionCount = Array.isArray(day.transactions) ? day.transactions.length : 0;
    
    if (transactionCount >= MAX_TRANSACTIONS) {
      alert(isUk ? 'Максимум 5 операцій на день' : 'Maximum 5 transactions per day');
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
    const updatedTransactions = (day.transactions || []).filter(t => t.id !== transactionId);
    updateDay(dayIndex, 'transactions', updatedTransactions);
  };

  const handleSaveTransaction = (transactionData: Partial<Transaction>) => {
    const { dayIndex, transaction: existingTransaction } = modalState;
    if (dayIndex === null) return;

    const day = days[dayIndex];
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

  return (
    <div className="block md:hidden space-y-3 mb-4">
      {days.map((day, index) => {
        const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
        
        const transactions = Array.isArray(day.transactions) ? day.transactions : [];
        const transactionCount = transactions.length;
        const canAddMore = transactionCount < MAX_TRANSACTIONS;

        return (
          <div key={day.day} className="bg-white rounded-xl shadow-lg p-4 border-2 border-gray-200 hover:border-blue-400 transition-all">
            {/* Day Header */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-gray-200">
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold text-lg rounded-lg px-3 py-1">
                  {isUk ? `День ${day.day}` : `Day ${day.day}`}
                </div>
              </div>
              <div className="text-xs font-semibold text-gray-500">
                {isUk ? 'Накопичений баланс' : 'Cumulative balance'}
              </div>
            </div>

            {/* Transactions Section */}
            <div className="mb-3">
              {transactions.length > 0 && (
                <div className="space-y-2 mb-2">
                  {transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <span className={`text-sm font-semibold ${
                          t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {t.type === 'income' ? '✅' : '❌'} {t.amount} {t.currency}
                        </span>
                        <p className="text-xs text-gray-600 truncate">{t.description}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditTransaction(index, t)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(index, t.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {canAddMore ? (
                <button
                  onClick={() => handleAddTransaction(index)}
                  className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                >
                  {isUk ? '+ Додати операцію' : '+ Add Transaction'}
                </button>
              ) : (
                <div className="w-full px-3 py-2 text-sm bg-gray-200 text-gray-600 rounded-lg text-center">
                  {isUk ? 'Максимум 5 операцій на день' : 'Maximum 5 transactions per day'}
                </div>
              )}
            </div>

            {/* Dynamic currency sections */}
            {selectedCurrencies.map((currencyCode, currencyIdx) => {
              const currency = getCurrencyInfo(currencyCode);
              if (!currency) return null;
              
              const dayBalance = calculateDayBalance(day, currencyCode);
              const startBalance = startBalances[currencyCode] ?? 
                (currencyCode === 'UAH' ? startBalanceUAH :
                 currencyCode === 'USD' ? startBalanceUSD :
                 currencyCode === 'EUR' ? startBalanceEUR : null);
              const cumulative = calculateCumulativeBalance(index, days, startBalance, currencyCode);
              const incomeKey = `income${currencyCode}`;
              const expenseKey = `expense${currencyCode}`;
              const income = amounts[incomeKey] || 0;
              const expense = amounts[expenseKey] || 0;
              
              const colors = [
                'from-blue-50 to-blue-100/70 border-blue-200',
                'from-emerald-50 to-green-100/70 border-emerald-200',
                'from-amber-50 to-yellow-100/70 border-amber-200'
              ];
              const colorClass = colors[currencyIdx % colors.length];
              const symbol = getCurrencySymbol(currencyCode);
              
              return (
                <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 rounded-lg mb-2 border ${currencyIdx === selectedCurrencies.length - 1 ? '' : 'mb-2'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-700">
                      {currency.emoji} {getCurrencyName(currencyCode, isUk ? 'uk' : 'en')} ({currencyCode})
                    </h4>
                    <div className="text-xs font-semibold text-gray-600">
                      {isUk ? 'Накоп: ' : 'Cum: '}
                      <span className={cumulative >= (parseFloat(String(startBalance)) || 0) ? 'text-emerald-600' : 'text-rose-600'}>
                        {symbol}{cumulative.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        {isUk ? '✅ Надбавки' : '✅ Income'}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-emerald-50 border-2 border-emerald-200 rounded-lg font-semibold text-emerald-700">
                        {income > 0 ? income.toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        {isUk ? '❌ Витрати' : '❌ Expenses'}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-rose-50 border-2 border-rose-200 rounded-lg font-semibold text-rose-700">
                        {expense > 0 ? expense.toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-600">
                      {isUk ? 'Баланс дня: ' : 'Day balance: '}
                    </span>
                    <span className={`text-sm font-bold ${dayBalance > 0 ? 'text-emerald-600' : dayBalance < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                      {symbol}{dayBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Converted to Display Currency Section */}
            {(() => {
              const displayInfo = getCurrencyInfo(displayCurrency);
              const displaySymbol = displayInfo ? displayInfo.symbol : displayCurrency;
              const displayEmoji = displayInfo ? displayInfo.emoji : '';
              
              // Конвертуємо надбавки, витрати та баланси з усіх обраних валют
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
                const startBalance = startBalances[currencyCode] ?? 
                  (currencyCode === 'UAH' ? startBalanceUAH :
                   currencyCode === 'USD' ? startBalanceUSD :
                   currencyCode === 'EUR' ? startBalanceEUR : null);
                const cumulative = calculateCumulativeBalance(index, days, startBalance, currencyCode);
                
                convertedIncome += convertCurrency(income, currencyCode, displayCurrency, exchangeRates);
                convertedExpense += convertCurrency(expense, currencyCode, displayCurrency, exchangeRates);
                convertedDayBalance += convertCurrency(dayBalance, currencyCode, displayCurrency, exchangeRates);
                convertedCumulative += convertCurrency(cumulative, currencyCode, displayCurrency, exchangeRates);
              });
              
              return (
                <div className="bg-gradient-to-br from-indigo-50 to-violet-100/70 p-3 rounded-lg border-2 border-indigo-300">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-700">
                      {displayEmoji} {displayCurrency} {isUk ? '(Конвертовано)' : '(Converted)'}
                    </h4>
                    <div className="text-xs font-semibold text-gray-600">
                      {isUk ? 'Накоп: ' : 'Cum: '}
                      <span className={convertedCumulative >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {displaySymbol}{convertedCumulative.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        {isUk ? '✅ Надбавки' : '✅ Income'}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-emerald-50 border-2 border-emerald-200 rounded-lg font-semibold text-emerald-700">
                        {convertedIncome > 0 ? convertedIncome.toFixed(2) : '0.00'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">
                        {isUk ? '❌ Витрати' : '❌ Expenses'}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-rose-50 border-2 border-rose-200 rounded-lg font-semibold text-rose-700">
                        {convertedExpense > 0 ? convertedExpense.toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-gray-600">
                      {isUk ? 'Баланс дня: ' : 'Day balance: '}
                    </span>
                    <span className={`text-sm font-bold ${convertedDayBalance > 0 ? 'text-emerald-600' : convertedDayBalance < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                      {displaySymbol}{convertedDayBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
      
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

export default React.memo(DaysCards);

