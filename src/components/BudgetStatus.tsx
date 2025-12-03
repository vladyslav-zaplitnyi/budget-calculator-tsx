import React, { useState } from 'react';
import { getCurrencyInfo, getCurrencySymbol, getCurrencyEmoji, AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { convertCurrency } from '../utils/calculations';
import { ExchangeRates } from '../types';

interface BudgetStatusProps {
  isUk: boolean;
  finalBalances: Record<string, number>;
  startBalances: Record<string, number | null>;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  totalInUAH: number;
  totalInBaseCurrency: number;
  baseCurrency: string;
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => void;
  setDisplayCurrencyIndex: (index: number) => void;
  totalInDisplayCurrency: number;
}

const BudgetStatus: React.FC<BudgetStatusProps> = ({
  isUk,
  finalBalances = {},
  startBalances = {},
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  exchangeRates = {},
  totalInUAH,
  totalInBaseCurrency,
  baseCurrency = 'UAH',
  displayCurrency = 'UAH',
  setDisplayCurrency,
  setDisplayCurrencyIndex,
  totalInDisplayCurrency
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const colors = [
    'border-blue-200 hover:border-blue-300',
    'border-emerald-200 hover:border-emerald-300',
    'border-amber-200 hover:border-amber-300'
  ];

  const getConvertedValue = (currencyCode: string, finalBalance: number) => {
    // Якщо валюта балансу така ж як валюта відображення - не показуємо конвертацію
    if (currencyCode === displayCurrency) {
      return null;
    }
    
    const displayInfo = getCurrencyInfo(displayCurrency);
    const displaySymbol = displayInfo ? displayInfo.symbol : displayCurrency;
    
    // Використовуємо функцію convertCurrency для правильної конвертації з урахуванням buy/sell курсів
    const convertedValue = convertCurrency(finalBalance, currencyCode, displayCurrency, exchangeRates);
    
    return `≈ ${convertedValue.toFixed(2)} ${displaySymbol}`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-indigo-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">📊</span>{' '}
        {isUk ? 'Поточний стан бюджету' : 'Current budget status'}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {selectedCurrencies.map((currencyCode, index) => {
          const currency = getCurrencyInfo(currencyCode);
          if (!currency) return null;
          
          const finalBalance = finalBalances[`finalBalance${currencyCode}`] || 0;
          const startBalance = startBalances[currencyCode] ?? null;
          const startBalanceValue = startBalance !== null && startBalance !== undefined 
            ? parseFloat(String(startBalance)) || 0 
            : 0;
          const isPositive = finalBalance >= startBalanceValue;
          
          return (
            <div key={currencyCode} className={`bg-white/80 backdrop-blur p-4 rounded-xl shadow-lg border-2 ${colors[index % colors.length]} transition-all`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-600">
                  {isUk ? `Баланс ${currencyCode}` : `${currencyCode} balance`}
                </p>
                <span className="text-lg">{currency.emoji}</span>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold mb-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {currency.symbol}{finalBalance.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">
                {getConvertedValue(currencyCode, finalBalance) || (currencyCode === displayCurrency ? displayCurrency : '')}
              </p>
            </div>
          );
        })}

        {/* Total in Display Currency */}
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-4 rounded-xl shadow-lg border-2 border-indigo-300 hover:border-indigo-400 transition-all text-white relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold">
              {isUk ? 'Загальна вартість' : 'Total value'}
            </p>
            <span className="text-lg">💎</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-2xl sm:text-3xl font-bold">
              {getCurrencySymbol(displayCurrency)}
              {totalInDisplayCurrency !== undefined ? totalInDisplayCurrency.toFixed(2) : (totalInBaseCurrency !== undefined ? totalInBaseCurrency.toFixed(2) : totalInUAH.toFixed(2))}
            </p>
            {/* Випадаюче меню з прапорами */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-1 bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1 transition-all"
                title={isUk ? 'Обрати валюту відображення' : 'Select display currency'}
              >
                <span className="text-lg">{getCurrencyEmoji(displayCurrency)}</span>
                <span className="text-xs font-semibold">{displayCurrency}</span>
                <span className="text-xs">▼</span>
              </button>
              
              {isDropdownOpen && (
                <>
                  {/* Overlay для закриття при кліку поза меню */}
                  <div 
                    className="fixed inset-0 z-[100]" 
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  {/* Випадаюче меню - показуємо тільки обрані валюти */}
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border-2 border-indigo-200 z-[101] min-w-[200px] max-h-[300px] overflow-y-auto">
                    <div className="p-2">
                      {selectedCurrencies.map((currencyCode) => {
                        const currency = AVAILABLE_CURRENCIES[currencyCode];
                        if (!currency) return null;
                        
                        const isSelected = currencyCode === displayCurrency;
                        
                        return (
                          <button
                            key={currencyCode}
                            type="button"
                            onClick={() => {
                              if (setDisplayCurrency) {
                                setDisplayCurrency(currencyCode);
                                // Знаходимо індекс обраної валюти
                                const index = selectedCurrencies.indexOf(currencyCode);
                                if (index !== -1 && setDisplayCurrencyIndex) {
                                  setDisplayCurrencyIndex(index);
                                }
                              }
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all text-left ${
                              isSelected
                                ? 'bg-indigo-100 text-indigo-700 font-semibold'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <span className="text-xl">{currency.emoji}</span>
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{currencyCode}</div>
                              <div className="text-xs text-gray-500">
                                {getCurrencyName(currencyCode, isUk ? 'uk' : 'en')}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-indigo-600">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-xs opacity-90">
            {displayCurrency} ({selectedCurrencies.map((code, idx) => {
              const balance = finalBalances[`finalBalance${code}`] || 0;
              const symbol = getCurrencySymbol(code);
              return `${idx > 0 ? ' + ' : ''}${symbol}${balance.toFixed(0)}`;
            }).join('')})
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BudgetStatus);

