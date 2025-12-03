import React, { ChangeEvent, RefObject } from 'react';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair, getBuyRate } from '../utils/typeGuards';

interface SettingsCardProps {
  isUk: boolean;
  user: User | null;
  budgets: Budgets;
  activeBudgetId: string;
  handleBudgetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  handleAddBudgetClick: () => void;
  handleDeleteBudget: () => void;
  startBalanceUAH: number | null;
  setStartBalanceUAH: (value: number | null) => void;
  startBalanceUSD: number | null;
  setStartBalanceUSD: (value: number | null) => void;
  startBalanceEUR: number | null;
  setStartBalanceEUR: (value: number | null) => void;
  usdRate: number;
  setUsdRate: (rate: number) => void;
  eurRate: number;
  setEurRate: (rate: number) => void;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  handleCurrencyChange: (currencies: string[]) => void;
  handleExchangeRateChange: (pairKey: string, type: string | undefined, rate: number) => void;
  handleStartBalanceChange: (currencyCode: string, value: string) => void;
  startBalances: Record<string, number | null>;
  handleExportToJsonFile: () => void;
  handleImportFromJsonFile: () => void;
  isLoading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleJsonFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  saveMessage: string;
  loadMessage: string;
  handleClearAll: () => void;
  baseCurrency: string;
  handleUpdateNbuRates: () => Promise<void>;
  isUpdatingRates: boolean;
  rateUpdateMessage: string;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  isUk,
  user,
  budgets,
  activeBudgetId,
  handleBudgetChange,
  handleAddBudgetClick,
  handleDeleteBudget,
  startBalanceUAH,
  setStartBalanceUAH,
  startBalanceUSD,
  setStartBalanceUSD,
  startBalanceEUR,
  setStartBalanceEUR,
  usdRate,
  setUsdRate,
  eurRate,
  setEurRate,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  exchangeRates = {},
  handleCurrencyChange,
  handleExchangeRateChange,
  handleStartBalanceChange,
  startBalances = {},
  handleExportToJsonFile,
  handleImportFromJsonFile,
  isLoading,
  fileInputRef,
  handleJsonFileSelected,
  saveMessage,
  loadMessage,
  handleClearAll,
  baseCurrency = 'UAH',
  handleUpdateNbuRates,
  isUpdatingRates,
  rateUpdateMessage
}) => {
  const handleCurrencySelect = (currencyCode: string, index: number) => {
    const newCurrencies = [...selectedCurrencies];
    newCurrencies[index] = currencyCode;
    if (handleCurrencyChange) {
      handleCurrencyChange(newCurrencies);
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">⚙️</span> {isUk ? 'Налаштування' : 'Settings'}
      </h2>

      {/* Multi-budget selector (тільки для авторизованих користувачів) */}
      {user && (
        <div className="mb-4 sm:mb-6">
          <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
            {isUk ? 'Бюджет' : 'Budget'}
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={
                budgets && Object.keys(budgets).length > 0 ? activeBudgetId : ''
              }
              onChange={handleBudgetChange}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
              disabled={!budgets || Object.keys(budgets).length === 0}
            >
              {(!budgets || Object.keys(budgets).length === 0) ? (
                <option value="">
                  {isUk ? 'Ще немає збережених бюджетів' : 'No budgets yet'}
                </option>
              ) : (
                Object.entries(budgets).map(([id, budget]) => (
                  <option key={id} value={id}>
                    {budget.name || (isUk ? 'Без назви' : 'Untitled')}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={handleAddBudgetClick}
              className="inline-flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-teal-600 active:scale-95 transition-all"
              title={isUk ? 'Додати новий бюджет' : 'Add new budget'}
            >
              [+]
            </button>
            {budgets && Object.keys(budgets).length > 1 && activeBudgetId !== 'default' && (
              <button
                type="button"
                onClick={handleDeleteBudget}
                className="inline-flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 active:scale-95 transition-all"
                title={isUk ? 'Видалити поточний бюджет' : 'Delete current budget'}
              >
                [×]
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
            {isUk
              ? 'У безкоштовній версії доступно до 3 бюджетів. Основний бюджет (Main/Основний) не можна видалити.'
              : 'Free version allows up to 3 budgets. Main budget (Main/Основний) cannot be deleted.'}
          </p>
        </div>
      )}

      {/* Currency Selector */}
      <div className="mb-4 sm:mb-6">
        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {isUk ? '💱 Вибір валют (3 валюти)' : '💱 Currency Selection (3 currencies)'}
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {selectedCurrencies.map((currencyCode, index) => {
            const availableCurrencies = Object.keys(AVAILABLE_CURRENCIES);
            
            return (
              <div key={index} className="relative">
                <select
                  value={currencyCode}
                  onChange={(e) => handleCurrencySelect(e.target.value, index)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                >
                  {availableCurrencies.map(code => {
                    const curr = AVAILABLE_CURRENCIES[code];
                    const isSelected = selectedCurrencies.includes(code) && code !== currencyCode;
                    return (
                      <option 
                        key={code} 
                        value={code} 
                        disabled={isSelected}
                      >
                        {curr.emoji} {code} - {getCurrencyName(code, isUk ? 'uk' : 'en')}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
          {isUk
            ? 'Оберіть 3 валюти для відстеження. Кожна валюта може бути вибрана тільки один раз.'
            : 'Select 3 currencies to track. Each currency can only be selected once.'}
        </p>
      </div>

      {/* Initial Balances */}
      <div className="mb-4 sm:mb-6">
        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {isUk ? '💰 Початкові баланси' : '💰 Starting Balances'}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {selectedCurrencies.map((currencyCode, index) => {
            const currency = AVAILABLE_CURRENCIES[currencyCode];
            if (!currency) return null;
            
            // Отримуємо поточний баланс для валюти
            let currentBalance: number | null = null;
            if (currencyCode === 'UAH') {
              currentBalance = startBalanceUAH;
            } else if (currencyCode === 'USD') {
              currentBalance = startBalanceUSD;
            } else if (currencyCode === 'EUR') {
              currentBalance = startBalanceEUR;
            } else {
              // Для інших валют використовуємо startBalances
              currentBalance = startBalances[currencyCode] ?? null;
            }
            
            const colors = [
              'from-blue-50 to-blue-100/70 border-blue-200 hover:border-blue-300',
              'from-emerald-50 to-green-100/70 border-emerald-200 hover:border-emerald-300',
              'from-amber-50 to-yellow-100/70 border-amber-200 hover:border-amber-300'
            ];
            const colorClass = colors[index % colors.length];
            
            return (
              <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 sm:p-4 rounded-xl border-2 transition-all`}>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  {currency.emoji} {isUk ? `Початковий бюджет (${currencyCode})` : `Starting budget (${currencyCode})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={currentBalance ?? ''}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (handleStartBalanceChange) {
                      handleStartBalanceChange(currencyCode, inputValue);
                    } else {
                      const numValue = inputValue === '' ? null : (isNaN(parseFloat(inputValue)) ? null : parseFloat(inputValue));
                      if (currencyCode === 'UAH') {
                        setStartBalanceUAH(numValue);
                      } else if (currencyCode === 'USD') {
                        setStartBalanceUSD(numValue);
                      } else if (currencyCode === 'EUR') {
                        setStartBalanceEUR(numValue);
                      }
                    }
                  }}
                  placeholder={isUk ? '0' : '0'}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base sm:text-lg font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="mb-4 sm:mb-6">
        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {isUk ? '💱 Курси обміну' : '💱 Exchange Rates'}
        </label>
        <div className="space-y-4">
          {selectedCurrencies.map((currencyCode, index) => {
            if (currencyCode === baseCurrency) return null; // Не показуємо курс базової валюти до самої себе
            
            const currency = AVAILABLE_CURRENCIES[currencyCode];
            const pairKey = `${baseCurrency}_${currencyCode}`;
            const reversePairKey = `${currencyCode}_${baseCurrency}`;
            
            let buyRate, sellRate;
            const pairValue = exchangeRates[pairKey];
            const reversePairValue = exchangeRates[reversePairKey];
            
            if (isExchangeRatePair(pairValue)) {
              buyRate = pairValue.buy || 1;
              sellRate = pairValue.sell || 1;
            } else if (isExchangeRatePair(reversePairValue)) {
              sellRate = reversePairValue.buy ? 1 / reversePairValue.buy : 1;
              buyRate = reversePairValue.sell ? 1 / reversePairValue.sell : 1;
            } else {
              const rateVal = exchangeRates[currencyCode];
              let oldRate: number;
              if (typeof rateVal === 'number') {
                  oldRate = rateVal;
              } else if (isExchangeRatePair(rateVal)) {
                  oldRate = getBuyRate(rateVal, 1);
              } else {
                  oldRate = (currencyCode === 'USD' ? usdRate : currencyCode === 'EUR' ? eurRate : 1);
              }
              buyRate = oldRate;
              sellRate = oldRate * 1.01;
            }
            
            const colors = [
              'from-violet-50 to-indigo-100/70 border-violet-200',
              'from-fuchsia-50 to-purple-100/70 border-fuchsia-200',
              'from-rose-50 to-pink-100/70 border-rose-200'
            ];
            const colorClass = colors[index % colors.length];
            
            return (
              <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 sm:p-4 rounded-xl border-2 hover:border-opacity-70 transition-all`}>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                  {currency.emoji} {baseCurrency} ↔ {currencyCode}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Купівля */}
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                      {isUk ? `Купівля (${baseCurrency} → ${currencyCode})` : `Buy (${baseCurrency} → ${currencyCode})`}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={buyRate}
                      onChange={(e) => {
                        const newRate = parseFloat(e.target.value) || 0;
                        if (handleExchangeRateChange) {
                          handleExchangeRateChange(pairKey, 'buy', newRate);
                        }
                      }}
                      className="w-full px-2 sm:px-3 py-2 text-sm sm:text-base font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                    />
                  </div>
                  {/* Продаж */}
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                      {isUk ? `Продаж (${currencyCode} → ${baseCurrency})` : `Sell (${currencyCode} → ${baseCurrency})`}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sellRate}
                      onChange={(e) => {
                        const newRate = parseFloat(e.target.value) || 0;
                        if (handleExchangeRateChange) {
                          handleExchangeRateChange(pairKey, 'sell', newRate);
                        }
                      }}
                      className="w-full px-2 sm:px-3 py-2 text-sm sm:text-base font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
          {isUk
            ? `Курси обміну для кожної пари валют. Купівля - курс для покупки валюти, Продаж - курс для продажу валюти.`
            : `Exchange rates for each currency pair. Buy - rate for buying currency, Sell - rate for selling currency.`}
        </p>
        {/* Кнопка оновлення курсів НБУ */}
        {handleUpdateNbuRates && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleUpdateNbuRates}
              disabled={isUpdatingRates}
              className={`w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm ${
                isUpdatingRates
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl active:scale-95'
              }`}
            >
              {isUpdatingRates
                ? (isUk ? '⏳ Оновлення курсів...' : '⏳ Updating rates...')
                : (isUk ? '🔄 Оновити курси з НБУ' : '🔄 Update rates from NBU')}
            </button>
            {rateUpdateMessage && (
              <span
                className={`block mt-2 text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg ${
                  rateUpdateMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                }`}
              >
                {rateUpdateMessage}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 sm:space-y-4">
        {/* Для локальної взаємодії */}
        <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-4 rounded-xl border-2 border-slate-200 space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-1 flex items-center">
            <span className="mr-2">💾</span>{' '}
            {isUk ? 'Для локальної взаємодії' : 'For local interaction'}
          </h3>
          <p className="text-[10px] sm:text-xs text-gray-500">
            {isUk
              ? 'Ви можете зберегти JSON на диск, а потім у будь-який момент імпортувати його назад.'
              : 'You can save JSON to disk and then import it back at any time.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleExportToJsonFile}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-xl active:scale-95"
            >
              {isUk ? '📥 Завантажити JSON на диск' : '📥 Download JSON to disk'}
            </button>
            <button
              type="button"
              onClick={handleImportFromJsonFile}
              disabled={isLoading}
              className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg hover:shadow-xl active:scale-95'
              }`}
            >
              {isLoading
                ? isUk
                  ? '⏳ Імпорт...'
                  : '⏳ Importing...'
                : isUk
                ? '⬆️ Імпортувати з JSON-файлу'
                : '⬆️ Import from JSON file'}
            </button>
          </div>
          <input
            type="file"
            accept="application/json"
            ref={fileInputRef}
            onChange={handleJsonFileSelected}
            className="hidden"
          />
          {saveMessage && (
            <span
              className={`block text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg ${
                saveMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
              }`}
            >
              {saveMessage}
            </span>
          )}
          {loadMessage && (
            <span
              className={`block text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg ${
                loadMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
              }`}
            >
              {loadMessage}
            </span>
          )}
        </div>

        {/* Очищення даних */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
          <button
            onClick={handleClearAll}
            className="w-full px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg hover:shadow-xl active:scale-95"
          >
            {isUk ? '🗑️ Стерти всі поля' : '🗑️ Clear all fields'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsCard);
