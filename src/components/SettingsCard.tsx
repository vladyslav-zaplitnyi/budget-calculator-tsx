import React, { ChangeEvent, RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair, getBuyRate } from '../utils/typeGuards';
import PasswordModal from './PasswordModal';
import ConfirmModal from './ConfirmModal';

interface SettingsCardProps {
  isUk: boolean;
  user: User | null;
  budgets: Budgets | null | undefined;
  activeBudgetId: string;
  handleBudgetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  handleAddBudgetClick: () => void;
  handleDeleteBudget: () => void;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  handleCurrencyChange: (currencies: string[]) => void;
  handleExchangeRateChange: (pairKey: string, type: string | undefined, rate: number) => void;
  handleStartBalanceChange: (currencyCode: string, value: string) => void;
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
  // Encryption props
  handleEnableEncryptionClick?: () => void;
  handleDisableEncryptionClick?: () => void;
  handleEnableEncryption?: (password: string, confirmPassword: string) => void;
  handleDisableEncryption?: (password: string) => void;
  showEnableEncryptionModal?: boolean;
  showDisableEncryptionModal?: boolean;
  setShowEnableEncryptionModal?: (show: boolean) => void;
  setShowDisableEncryptionModal?: (show: boolean) => void;
  isEncrypted?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  isUk,
  user,
  budgets = {},
  activeBudgetId,
  handleBudgetChange,
  handleAddBudgetClick,
  handleDeleteBudget,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  exchangeRates = {},
  handleCurrencyChange,
  handleExchangeRateChange,
  handleStartBalanceChange,
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
  rateUpdateMessage,
  handleEnableEncryptionClick,
  handleDisableEncryptionClick,
  handleEnableEncryption,
  handleDisableEncryption,
  showEnableEncryptionModal = false,
  showDisableEncryptionModal = false,
  setShowEnableEncryptionModal,
  setShowDisableEncryptionModal,
  isEncrypted = false
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  
  // Ensure budgets is always an object to prevent runtime errors
  const safeBudgets = budgets || {};
  
  // Стан для модального вікна підтвердження зміни валюти
  const [showCurrencyChangeConfirm, setShowCurrencyChangeConfirm] = useState(false);
  const [pendingCurrencyChange, setPendingCurrencyChange] = useState<{ currencies: string[]; index: number; previousValue: string } | null>(null);
  // Локальний стан для відображення валют у select (для відновлення при скасуванні)
  const [displayCurrencies, setDisplayCurrencies] = useState<string[]>(selectedCurrencies);
  
  // Синхронізуємо displayCurrencies з selectedCurrencies, коли немає pending зміни
  React.useEffect(() => {
    if (!showCurrencyChangeConfirm) {
      setDisplayCurrencies(selectedCurrencies);
    }
  }, [selectedCurrencies, showCurrencyChangeConfirm]);
  
  const handleCurrencySelect = (currencyCode: string, index: number) => {
    const previousValue = selectedCurrencies[index];
    
    // Перевіряємо, чи валюта дійсно змінилася
    if (currencyCode === previousValue) {
      return; // Валюта не змінилася, нічого не робимо
    }
    
    // Оновлюємо локальний стан для відображення
    const newDisplayCurrencies = [...displayCurrencies];
    newDisplayCurrencies[index] = currencyCode;
    setDisplayCurrencies(newDisplayCurrencies);
    
    // Зберігаємо нові валюти та показуємо модальне вікно
    const newCurrencies = [...selectedCurrencies];
    newCurrencies[index] = currencyCode;
    setPendingCurrencyChange({ currencies: newCurrencies, index, previousValue });
    setShowCurrencyChangeConfirm(true);
  };
  
  const handleConfirmCurrencyChange = () => {
    if (pendingCurrencyChange && handleCurrencyChange) {
      handleCurrencyChange(pendingCurrencyChange.currencies);
    }
    setShowCurrencyChangeConfirm(false);
    setPendingCurrencyChange(null);
  };
  
  const handleCancelCurrencyChange = () => {
    // Відновлюємо попереднє значення
    if (pendingCurrencyChange) {
      const restoredCurrencies = [...displayCurrencies];
      restoredCurrencies[pendingCurrencyChange.index] = pendingCurrencyChange.previousValue;
      setDisplayCurrencies(restoredCurrencies);
    }
    setShowCurrencyChangeConfirm(false);
    setPendingCurrencyChange(null);
  };

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100">
      <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="mr-2">⚙️</span> {t('settings.title')}
      </h2>

      {/* Multi-budget selector (тільки для авторизованих користувачів) */}
      {user && (
        <div className="mb-4 sm:mb-6">
          <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
            {t('settings.budget.label')}
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={
                safeBudgets && Object.keys(safeBudgets).length > 0 ? activeBudgetId : ''
              }
              onChange={handleBudgetChange}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
              disabled={!safeBudgets || Object.keys(safeBudgets).length === 0}
            >
              {(!safeBudgets || Object.keys(safeBudgets).length === 0) ? (
                <option value="">
                  {t('settings.budget.noBudgets')}
                </option>
              ) : (
                Object.entries(safeBudgets).map(([id, budget]) => (
                  <option key={id} value={id}>
                    {budget.name || t('settings.budget.untitled')}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={handleAddBudgetClick}
              className="inline-flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-teal-600 active:scale-95 transition-all"
              title={t('settings.budget.add')}
            >
              [+]
            </button>
            {safeBudgets && Object.keys(safeBudgets).length > 1 && activeBudgetId !== 'default' && (
              <button
                type="button"
                onClick={handleDeleteBudget}
                className="inline-flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white font-bold text-sm shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 active:scale-95 transition-all"
                title={t('settings.budget.delete')}
              >
                [×]
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
            {t('settings.budget.description')}
          </p>
        </div>
      )}

      {/* Currency Selector */}
      <div className="mb-4 sm:mb-6">
        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {t('settings.currency.selection')}
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {displayCurrencies.map((currencyCode, index) => {
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
                    const isSelected = displayCurrencies.includes(code) && code !== currencyCode;
                    return (
                      <option 
                        key={code} 
                        value={code} 
                        disabled={isSelected}
                      >
                        {curr.emoji} {code} - {getCurrencyName(code, i18nInstance.language === 'uk' ? 'uk' : 'en')}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
          {t('settings.currency.description')}
        </p>
      </div>

      {/* Initial Balances */}
      <div className="mb-4 sm:mb-6">
        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {t('settings.balances.title')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {selectedCurrencies.map((currencyCode, index) => {
            const currency = AVAILABLE_CURRENCIES[currencyCode];
            if (!currency) return null;
            
            // Отримуємо поточний баланс для валюти з бюджету
            const activeBudget = safeBudgets && safeBudgets[activeBudgetId || 'default'];
            const currentBalance = activeBudget?.startBalances?.[currencyCode] ?? null;
            
            const colors = [
              'from-blue-50 to-blue-100/70 border-blue-200 hover:border-blue-300',
              'from-emerald-50 to-green-100/70 border-emerald-200 hover:border-emerald-300',
              'from-amber-50 to-yellow-100/70 border-amber-200 hover:border-amber-300'
            ];
            const colorClass = colors[index % colors.length];
            
            return (
              <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 sm:p-4 rounded-xl border-2 transition-all`}>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  {currency.emoji} {t('settings.balances.startingBudget')} ({currencyCode})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={currentBalance ?? ''}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (handleStartBalanceChange) {
                      handleStartBalanceChange(currencyCode, inputValue);
                    }
                  }}
                  placeholder="0"
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
          {t('settings.exchangeRates.title')}
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
                  // Отримуємо курс з exchangeRates або використовуємо дефолтне значення
                  const pairKey = `${baseCurrency}_${currencyCode}`;
                  const ratePair = exchangeRates[pairKey];
                  if (isExchangeRatePair(ratePair)) {
                    oldRate = ratePair.buy;
                  } else if (typeof ratePair === 'number') {
                    oldRate = ratePair;
                  } else {
                    if (currencyCode === 'USD') {
                      oldRate = 41.5;
                    } else if (currencyCode === 'EUR') {
                      oldRate = 45;
                    } else {
                      oldRate = 1;
                    }
                  }
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
                      {t('settings.exchangeRates.buy')} ({baseCurrency} → {currencyCode})
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
                      {t('settings.exchangeRates.sell')} ({currencyCode} → {baseCurrency})
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
          {t('settings.exchangeRates.description')}
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
                ? t('settings.exchangeRates.updating')
                : t('settings.exchangeRates.update')}
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
            {t('settings.localInteraction.title')}
          </h3>
          <p className="text-[10px] sm:text-xs text-gray-500">
            {t('settings.localInteraction.description')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleExportToJsonFile}
              className="flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-xl active:scale-95"
            >
              {t('settings.localInteraction.export')}
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
                ? t('settings.localInteraction.importing')
                : t('settings.localInteraction.import')}
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
            {t('settings.clearAll')}
          </button>
        </div>
      </div>

      {/* Security Section - тільки для авторизованих користувачів */}
      {user && (
        <div className="mt-4 sm:mt-6 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-4 sm:p-6 rounded-xl border-2 border-amber-200">
          <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-3 flex items-center">
            <span className="mr-2">🔒</span> {t('settings.security.title')}
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-4">
            {t('settings.security.description')}
          </p>
          
          {!isEncrypted ? (
            <button
              onClick={handleEnableEncryptionClick}
              className="w-full px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg hover:shadow-xl active:scale-95"
            >
              🔒 {t('settings.security.enable')}
            </button>
          ) : (
            <button
              onClick={handleDisableEncryptionClick}
              className="w-full px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white shadow-lg hover:shadow-xl active:scale-95"
            >
              🔓 {t('settings.security.disable')}
            </button>
          )}
        </div>
      )}

      {/* Модальні вікна для шифрування */}
      <PasswordModal
        isOpen={showEnableEncryptionModal}
        onClose={() => setShowEnableEncryptionModal?.(false)}
        onConfirm={() => {}}
        onConfirmPassword={handleEnableEncryption}
        title={isUk ? 'Увімкнути шифрування' : 'Enable Encryption'}
        message={isUk 
          ? 'Встановіть пароль для шифрування ваших даних. Якщо ви забудете цей пароль, дані відновити неможливо!'
          : 'Set a password to encrypt your data. If you forget this password, data cannot be recovered!'}
        confirmButtonText={isUk ? 'Увімкнути' : 'Enable'}
        cancelButtonText={isUk ? 'Скасувати' : 'Cancel'}
        isConfirmPassword={true}
      />
      
      <PasswordModal
        isOpen={showDisableEncryptionModal}
        onClose={() => setShowDisableEncryptionModal?.(false)}
        onConfirm={handleDisableEncryption || (() => {})}
        title={isUk ? 'Вимкнути шифрування' : 'Disable Encryption'}
        message={isUk 
          ? 'Введіть поточний пароль для вимкнення шифрування. Після цього дані будуть зберігатися у відкритому вигляді.'
          : 'Enter your current password to disable encryption. After this, data will be stored in plain text.'}
        confirmButtonText={isUk ? 'Вимкнути' : 'Disable'}
        cancelButtonText={isUk ? 'Скасувати' : 'Cancel'}
      />
      
      {/* Модальне вікно підтвердження зміни валюти */}
      <ConfirmModal
        isOpen={showCurrencyChangeConfirm}
        onClose={handleCancelCurrencyChange}
        onConfirm={handleConfirmCurrencyChange}
        title={t('settings.currency.changeConfirm.title')}
        message={t('settings.currency.changeConfirm.message')}
        confirmButtonText={t('settings.currency.changeConfirm.confirm')}
        cancelButtonText={t('settings.currency.changeConfirm.cancel')}
      />
    </div>
  );
};

export default React.memo(SettingsCard);
