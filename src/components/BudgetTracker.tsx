import React, { useEffect, useMemo } from 'react';
import Footer from './Footer';
import Header from './Header';
import SettingsCard from './SettingsCard';
import BudgetStatus from './BudgetStatus';
import DaysTable from './DaysTable';
import DaysCards from './DaysCards';
import Statistics from './Statistics';
import { useBudgetContext } from '../contexts/BudgetContext';
import { useBudgetHandlers } from '../hooks/useBudgetHandlers';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';

export default function BudgetTracker() {
  const context = useBudgetContext();
  const handlers = useBudgetHandlers();

  const {
    isUk,
    language,
    setLanguage,
    syncStatus,
    authLoading,
    user,
    loginWithGoogle,
    logout,
    deleteUserAccount,
    selectedCurrencies,
    exchangeRates,
    activeBudgetId,
    budgets,
    days,
    updateDay,
    displayCurrency,
    setDisplayCurrency,
    displayCurrencyIndex,
    setDisplayCurrencyIndex,
    baseCurrency,
    isLoading,
    saveMessage,
    loadMessage,
    isUpdatingRates,
    rateUpdateMessage,
    handleUpdateNbuRates,
    encryptionPassword,
    setEncryptionPassword,
    isEncrypted,
    showPasswordModal,
    handlePasswordSubmit
  } = context;

  const {
    handleClearAll,
    handleBudgetChange,
    handleAddBudgetClick,
    handleDeleteBudget,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange,
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef,
    handleEnableEncryptionClick,
    handleDisableEncryptionClick,
    handleEnableEncryption,
    handleDisableEncryption,
    showEnableEncryptionModal,
    showDisableEncryptionModal,
    setShowEnableEncryptionModal,
    setShowDisableEncryptionModal
  } = handlers;

  // Створюємо об'єкт початкових балансів для вибраних валют
  const startBalances = useMemo(() => {
    const activeBudget = budgets && budgets[activeBudgetId || 'default'];
    const budgetStartBalances = activeBudget?.startBalances || {};
    
    const balances: Record<string, number | null> = {};
    selectedCurrencies.forEach(code => {
      balances[code] = budgetStartBalances[code] ?? null;
    });
    return balances;
  }, [selectedCurrencies, budgets, activeBudgetId]);

  // Calculations
  const totals = useMemo(
    () => calculateTotals(days, selectedCurrencies),
    [days, selectedCurrencies]
  );

  const finalBalances = useMemo(
    () => calculateFinalBalances(days, null, null, null, selectedCurrencies, startBalances, totals),
    [days, selectedCurrencies, startBalances, totals]
  );
  
  // Обчислюємо загальну вартість у базовій валюті
  const totalInBaseCurrency = useMemo(() => {
    let total = 0;
    selectedCurrencies.forEach(code => {
      const finalBalance = finalBalances[`finalBalance${code}`] || 0;
      if (code === baseCurrency) {
        total += finalBalance;
      } else {
        total += convertCurrency(finalBalance, code, baseCurrency, exchangeRates);
      }
    });
    return total;
  }, [selectedCurrencies, finalBalances, baseCurrency, exchangeRates]);
  
  // Для зворотної сумісності зберігаємо totalInUAH
  // Використовуємо totalInBaseCurrency, який вже обчислює загальну вартість у базовій валюті
  const totalInUAH = totalInBaseCurrency;

  // Обчислюємо загальну вартість у вибраній валюті відображення
  const totalInDisplayCurrency = useMemo(() => {
    let total = 0;
    selectedCurrencies.forEach(code => {
      const finalBalance = finalBalances[`finalBalance${code}`] || 0;
      if (code === displayCurrency) {
        total += finalBalance;
      } else {
        total += convertCurrency(finalBalance, code, displayCurrency, exchangeRates);
      }
    });
    return total;
  }, [displayCurrency, selectedCurrencies, finalBalances, exchangeRates]);

  // Перевіряємо, чи валюта відображення є в обраних валютах
  useEffect(() => {
    if (!selectedCurrencies.includes(displayCurrency)) {
      const newIndex = Math.min(displayCurrencyIndex, selectedCurrencies.length - 1);
      const newDisplayCurrency = selectedCurrencies[newIndex] || selectedCurrencies[0] || 'UAH';
      setDisplayCurrency(newDisplayCurrency);
      setDisplayCurrencyIndex(newIndex);
    } else {
      const currentIndex = selectedCurrencies.indexOf(displayCurrency);
      if (currentIndex !== -1 && currentIndex !== displayCurrencyIndex) {
        setDisplayCurrencyIndex(currentIndex);
      }
    }
  }, [selectedCurrencies, displayCurrency, displayCurrencyIndex, setDisplayCurrency, setDisplayCurrencyIndex]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-50 p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="flex-1">
        <div className="max-w-7xl mx-auto">
          <Header
            isUk={isUk}
            syncStatus={syncStatus}
            authLoading={authLoading}
            user={user}
            loginWithGoogle={loginWithGoogle}
            logout={logout}
            language={language}
            setLanguage={setLanguage}
            deleteUserAccount={deleteUserAccount}
            isEncrypted={isEncrypted}
            encryptionPassword={encryptionPassword}
            setEncryptionPassword={setEncryptionPassword}
            showPasswordModal={showPasswordModal}
            handlePasswordSubmit={handlePasswordSubmit}
          />

          <SettingsCard
            isUk={isUk}
            user={user}
            budgets={budgets}
            activeBudgetId={activeBudgetId}
            handleBudgetChange={handleBudgetChange}
            handleAddBudgetClick={handleAddBudgetClick}
            handleDeleteBudget={handleDeleteBudget}
            selectedCurrencies={selectedCurrencies}
            exchangeRates={exchangeRates}
            handleCurrencyChange={handleCurrencyChange}
            handleExchangeRateChange={handleExchangeRateChange}
            handleStartBalanceChange={handleStartBalanceChange}
            handleExportToJsonFile={handleExportToJsonFile}
            handleImportFromJsonFile={handleImportFromJsonFile}
            isLoading={isLoading}
            fileInputRef={fileInputRef}
            handleJsonFileSelected={handleJsonFileSelected}
            saveMessage={saveMessage}
            loadMessage={loadMessage}
            handleClearAll={handleClearAll}
            baseCurrency={baseCurrency}
            handleUpdateNbuRates={handleUpdateNbuRates}
            isUpdatingRates={isUpdatingRates}
            rateUpdateMessage={rateUpdateMessage}
            handleEnableEncryptionClick={handleEnableEncryptionClick}
            handleDisableEncryptionClick={handleDisableEncryptionClick}
            handleEnableEncryption={handleEnableEncryption}
            handleDisableEncryption={handleDisableEncryption}
            showEnableEncryptionModal={showEnableEncryptionModal}
            showDisableEncryptionModal={showDisableEncryptionModal}
            setShowEnableEncryptionModal={setShowEnableEncryptionModal}
            setShowDisableEncryptionModal={setShowDisableEncryptionModal}
            isEncrypted={isEncrypted}
            updateDay={updateDay}
          />

          <BudgetStatus
            isUk={isUk}
            finalBalances={finalBalances}
            startBalances={startBalances}
            selectedCurrencies={selectedCurrencies}
            exchangeRates={exchangeRates}
            totalInUAH={totalInUAH}
            totalInBaseCurrency={totalInBaseCurrency}
            baseCurrency={baseCurrency}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
            setDisplayCurrencyIndex={setDisplayCurrencyIndex}
            totalInDisplayCurrency={totalInDisplayCurrency}
          />

          <DaysTable
            isUk={isUk}
            days={days}
            updateDay={updateDay}
            startBalances={startBalances}
            selectedCurrencies={selectedCurrencies}
            displayCurrency={displayCurrency}
            exchangeRates={exchangeRates}
          />

          <DaysCards
            isUk={isUk}
            days={days}
            updateDay={updateDay}
            startBalances={startBalances}
            selectedCurrencies={selectedCurrencies}
            displayCurrency={displayCurrency}
            exchangeRates={exchangeRates}
          />

          <Statistics
            isUk={isUk}
            totals={totals}
            selectedCurrencies={selectedCurrencies}
            displayCurrency={displayCurrency}
            exchangeRates={exchangeRates}
          />
        </div>
      </div>
      <Footer language={language} />
    </div>
  );
}

