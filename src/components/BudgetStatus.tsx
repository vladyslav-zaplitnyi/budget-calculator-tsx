import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrencyInfo, getCurrencySymbol, AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { convertCurrency, formatNumber } from '../utils/calculations';
import { ExchangeRates } from '../types';
import CurrencyFlag from './CurrencyFlag';

interface BudgetStatusProps {
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
  const { t, i18n: i18nInstance } = useTranslation();
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
    
    return `≈ ${formatNumber(convertedValue, 2)} ${displaySymbol}`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-indigo-100 transition-all hover:shadow-2xl">
      <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-4 flex items-center font-display tracking-tight">
        <span className="mr-2 text-2xl">📊</span>
        {t('budgetStatus.title')}
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
            <div key={currencyCode} className={`bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border-2 ${colors[index % colors.length]} transition-all hover:scale-105 hover:shadow-xl`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-600 font-display tracking-tight">
                  {t('budgetStatus.balance')} {currencyCode}
                </p>
                <CurrencyFlag currencyCode={currencyCode} size={18} />
              </div>
              <p className={`text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-1 font-display break-words overflow-hidden tabular-nums budget-number ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {currency.symbol}{formatNumber(finalBalance, 2)}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 font-sans tabular-nums">
                {getConvertedValue(currencyCode, finalBalance) || '\u00A0'}
              </p>
            </div>
          );
        })}

        {/* Total in Display Currency */}
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-4 rounded-xl shadow-lg border-2 border-indigo-300 hover:border-indigo-400 hover:shadow-2xl transition-all text-white relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold font-display tracking-tight">
              {t('budgetStatus.totalValue')}
            </p>
            <span className="text-xl">💎</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-2xl sm:text-3xl lg:text-4xl font-extrabold font-display break-words overflow-hidden tabular-nums budget-number">
              {getCurrencySymbol(displayCurrency)}
              {(() => {
                if (totalInDisplayCurrency !== undefined) {
                  return formatNumber(totalInDisplayCurrency, 2);
                }
                if (totalInBaseCurrency !== undefined) {
                  return formatNumber(totalInBaseCurrency, 2);
                }
                return formatNumber(totalInUAH, 2);
              })()}
            </p>
            {/* Випадаюче меню з прапорами */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-1 bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1.5 transition-all hover:scale-105"
                title={t('budgetStatus.selectDisplayCurrency')}
              >
                <CurrencyFlag currencyCode={displayCurrency} size={16} />
                <span className="text-xs font-semibold font-display">{displayCurrency}</span>
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
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border-2 border-indigo-200 z-[101] min-w-[220px] max-h-[320px] overflow-y-auto">
                    <div className="p-2 space-y-1">
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
                            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all text-left hover:bg-indigo-50 text-gray-700 ${
                              isSelected ? 'bg-indigo-50 font-semibold' : ''
                            }`}
                          >
                            <div className="flex-shrink-0">
                              <CurrencyFlag currencyCode={currencyCode} size={20} />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold font-display">{currencyCode}</div>
                              <div className="text-xs text-gray-500">
                                {getCurrencyName(currencyCode, i18nInstance.language === 'uk' ? 'uk' : 'en')}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-indigo-600 text-lg">✓</span>
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
          <p className="text-xs opacity-90 font-mono break-words overflow-hidden tabular-nums">
            {displayCurrency} ({selectedCurrencies.map((code, idx) => {
              const balance = finalBalances[`finalBalance${code}`] || 0;
              const symbol = getCurrencySymbol(code);
              return `${idx > 0 ? ' + ' : ''}${symbol}${formatNumber(balance, 0)}`;
            }).join('')})
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BudgetStatus);

