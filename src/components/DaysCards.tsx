import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
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
import { capitalizeFirstLetter, getWeekdayShortName } from '../utils/dateHelpers';

interface DaysCardsProps {
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

const DaysCards: React.FC<DaysCardsProps> = ({
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
  const { t, i18n: i18nInstance } = useTranslation();
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

  const handleAddTransaction = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day) return;
    const transactionCount = Array.isArray(day.transactions) ? day.transactions.length : 0;
    
    if (transactionCount >= MAX_TRANSACTIONS) {
      setAlertMessage(t('transaction.maxTransactions'));
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

  return (
    <div className="block md:hidden space-y-3 mb-4">
      {days.map((day, index) => {
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
          <div key={day.day} className="bg-white rounded-xl shadow-lg p-4 border-2 border-gray-200 hover:border-blue-400 transition-all hover:shadow-xl">
            {/* Day Header */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-gray-200">
              <div className="flex items-center gap-2">
                <span className="inline-block bg-indigo-600 !text-white font-bold text-base sm:text-lg rounded-lg px-3 py-1.5 font-display select-none" style={{ border: '3px solid #4f46e5', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)' }}>
                  {t('days.dayNumber')} <span className='samsung-white-text'>{day.day}</span>
                </span>
                <span className="text-sm font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded-md">
                  {capitalizeFirstLetter(weekday)}
                </span>
              </div>
              <div className="text-xs font-semibold text-gray-500 font-display">
                {t('days.cumulative')}
              </div>
            </div>

            {/* Transactions Section */}
            <div className="mb-3">
              {transactions.length > 0 && (
                <div className="space-y-2 mb-2">
                  {transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold font-display tabular-nums ${
                          t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {t.type === 'income' ? '✅' : '❌'} {t.amount} {t.currency}
                        </span>
                        <p className="text-xs text-gray-600 truncate mt-0.5">{t.description}</p>
                      </div>
                      <div className="flex gap-1.5 ml-2 flex-shrink-0">
                        <button
                          onClick={() => handleEditTransaction(index, t)}
                          className="text-blue-600 hover:text-blue-800 text-base transition-transform hover:scale-110"
                          aria-label="Edit transaction"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(index, t.id)}
                          className="text-red-600 hover:text-red-800 text-base transition-transform hover:scale-110"
                          aria-label="Delete transaction"
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
                  className="w-full px-3 py-2.5 text-sm bg-blue-500 !text-white rounded-lg hover:bg-blue-600 transition-all font-semibold font-display shadow-md hover:shadow-lg hover:scale-[1.02]"
                >
                  ➕ {t('days.addTransaction')}
                </button>
              ) : (
                <div className="w-full px-3 py-2 text-sm bg-gray-200 text-gray-600 rounded-lg text-center font-medium">
                  {t('transaction.maxTransactions')}
                </div>
              )}
            </div>

            {/* Dynamic currency sections */}
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
              
              const colors = [
                'from-blue-50 to-blue-100/70 border-blue-200',
                'from-emerald-50 to-green-100/70 border-emerald-200',
                'from-amber-50 to-yellow-100/70 border-amber-200'
              ];
              const colorClass = colors[currencyIdx % colors.length];
              const symbol = getCurrencySymbol(currencyCode);
              
              return (
                <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 rounded-lg mb-2 border shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-700 font-display flex items-center gap-1.5">
                      <CurrencyFlag currencyCode={currencyCode} size={18} />
                      <span className="hidden xs:inline">{getCurrencyName(currencyCode, i18nInstance.language === 'uk' ? 'uk' : 'en')}</span>
                      <span>({currencyCode})</span>
                    </h4>
                    <div className="text-xs font-semibold text-gray-900 tabular-nums">
                      Σ: <span className={`font-bold ${cumulative >= (parseFloat(String(startBalance)) || 0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {symbol}{cumulative.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1 font-medium">
                        ✅ {t('days.income')}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-emerald-50 border-2 border-emerald-200 rounded-lg font-semibold text-emerald-700 tabular-nums shadow-sm">
                        {income > 0 ? income.toFixed(2) : ''}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1 font-medium">
                        ❌ {t('days.expenses')}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-rose-50 border-2 border-rose-200 rounded-lg font-semibold text-rose-700 tabular-nums shadow-sm">
                        {expense > 0 ? expense.toFixed(2) : ''}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center p-2 bg-white/50 rounded-lg">
                    <span className="text-xs text-gray-600 font-medium block mb-0.5">
                      {t('days.dayBalance')}
                    </span>
                    {dayBalance !== 0 && (
                      <span className={`text-base font-bold tabular-nums ${dayBalance > 0 ? 'text-emerald-600' : dayBalance < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                        {symbol}{dayBalance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Converted to Display Currency Section */}
            {(() => {
              const displayInfo = getCurrencyInfo(displayCurrency);
              const displaySymbol = displayInfo ? displayInfo.symbol : displayCurrency;
              
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
                const startBalance = startBalances[currencyCode] ?? null;
                const cumulative = calculateCumulativeBalance(index, days, startBalance, currencyCode);
                
                convertedIncome += convertCurrency(income, currencyCode, displayCurrency, exchangeRates);
                convertedExpense += convertCurrency(expense, currencyCode, displayCurrency, exchangeRates);
                convertedDayBalance += convertCurrency(dayBalance, currencyCode, displayCurrency, exchangeRates);
                convertedCumulative += convertCurrency(cumulative, currencyCode, displayCurrency, exchangeRates);
              });
              
              return (
                <div className="bg-gradient-to-br from-indigo-50 to-violet-100/70 p-3 rounded-lg border-2 border-indigo-300 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-900 font-display flex items-center gap-1.5">
                      <CurrencyFlag currencyCode={displayCurrency} size={18} />
                      <span>{displayCurrency}</span>
                      <span className="hidden xs:inline text-[10px] font-normal">{t('days.converted')}</span>
                    </h4>
                    <div className="text-xs font-semibold text-gray-900 tabular-nums">
                      {convertedCumulative !== 0 && (
                        <>
                          Σ:{' '}
                          <span className={`font-bold ${convertedCumulative >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {displaySymbol}{convertedCumulative.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1 font-medium">
                        ✅ {t('days.income')}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-emerald-50 border-2 border-emerald-200 rounded-lg font-semibold text-emerald-700 tabular-nums shadow-sm">
                        {convertedIncome > 0 ? convertedIncome.toFixed(2) : ''}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1 font-medium">
                        ❌ {t('days.expenses')}
                      </label>
                      <div className="w-full px-2 py-2 text-sm text-right bg-rose-50 border-2 border-rose-200 rounded-lg font-semibold text-rose-700 tabular-nums shadow-sm">
                        {convertedExpense > 0 ? convertedExpense.toFixed(2) : ''}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center p-2 bg-white/50 rounded-lg">
                    <span className="text-xs text-gray-600 font-medium block mb-0.5">
                      {t('days.dayBalance')}
                    </span>
                    {convertedDayBalance !== 0 && (
                      <span className={`text-base font-bold tabular-nums ${convertedDayBalance > 0 ? 'text-emerald-600' : convertedDayBalance < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                        {displaySymbol}{convertedDayBalance.toFixed(2)}
                      </span>
                    )}
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

export default React.memo(DaysCards);

