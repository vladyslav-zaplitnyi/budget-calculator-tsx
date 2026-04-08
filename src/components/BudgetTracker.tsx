import React, { useEffect, useMemo } from 'react';
import Footer from './Footer';
import Header from './Header';
import SettingsCard from './SettingsCard';
import BudgetStatus from './BudgetStatus';
import DaysTable from './DaysTable';
import DaysCards from './DaysCards';
import Statistics from './Statistics';
import Analytics from './Analytics';
import AlertModal from './AlertModal';
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';
import ImportModal from './ImportModal';
import { useBudgetContext } from '../contexts/BudgetContext';
import { useBudgetHandlers } from '../hooks/useBudgetHandlers';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';
import { translate } from '../i18n/config';

export default function BudgetTracker() {
  const context = useBudgetContext();
  const handlers = useBudgetHandlers();

  const {
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
    handlePasswordSubmit,
    passwordError,
    budgetDate
  } = context;

  const {
    handleClearAll,
    handleClearAllDays,
    handleStartNewMonth,
    handleConfirmStartNewMonth,
    handleCancelStartNewMonth,
    showStartNewMonthModal,
    handleBudgetChange,
    handleAddBudgetClick,
    handleEditBudgetClick,
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
    setShowDisableEncryptionModal,
    showPromptModal,
    setShowPromptModal,
    handlePromptConfirm,
    showAlertModal,
    setShowAlertModal,
    alertMessage,
    alertType,
    showSettingsAlertModal,
    setShowSettingsAlertModal,
    settingsAlertMessage,
    settingsAlertType,
    showClearAllConfirmModal,
    handleConfirmClearAll,
    handleCancelClearAll,
    showClearAllDaysConfirmModal,
    handleConfirmClearAllDays,
    handleCancelClearAllDays,
    showDeleteBudgetConfirmModal,
    handleConfirmDeleteBudget,
    handleCancelDeleteBudget,
    budgetToDeleteName,
    showImportModal,
    resolveImport,
    cancelImport,
    pendingImport,
    // Edit budget name
    showEditNameModal,
    handleEditNameConfirm,
    handleCancelEditName,
    editingBudgetId
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
    () => calculateFinalBalances(days, selectedCurrencies, startBalances, totals),
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
            isUk={language === 'uk'}
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
            passwordError={passwordError}
            handleEnableEncryptionClick={handleEnableEncryptionClick}
            handleDisableEncryptionClick={handleDisableEncryptionClick}
            handleEnableEncryption={handleEnableEncryption}
            handleDisableEncryption={handleDisableEncryption}
            showEnableEncryptionModal={showEnableEncryptionModal}
            showDisableEncryptionModal={showDisableEncryptionModal}
            setShowEnableEncryptionModal={setShowEnableEncryptionModal}
            setShowDisableEncryptionModal={setShowDisableEncryptionModal}
            budgetYear={budgetDate.year}
            budgetMonth={budgetDate.month}
            setBudgetDate={context.setBudgetDate}
            days={days}
          />

          {/* Приховуємо весь контент між Header і Footer, якщо потрібен пароль */}
          {!(showPasswordModal && user) && (
            <>
              <SettingsCard
                isUk={language === 'uk'}
                user={user}
                budgets={budgets}
                activeBudgetId={activeBudgetId}
                handleBudgetChange={handleBudgetChange}
                handleAddBudgetClick={handleAddBudgetClick}
                handleEditBudgetClick={handleEditBudgetClick}
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
                handleClearAllDays={handleClearAllDays}
                handleStartNewMonth={handleStartNewMonth}
                handleConfirmStartNewMonth={handleConfirmStartNewMonth}
                handleCancelStartNewMonth={handleCancelStartNewMonth}
                showStartNewMonthModal={showStartNewMonthModal}
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
                days={days}
                budgetYear={budgetDate.year}
                budgetMonth={budgetDate.month}
              />

              <BudgetStatus
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
                days={days}
                budgetYear={budgetDate.year}
                budgetMonth={budgetDate.month}
              />

              <DaysTable
                isUk={language === 'uk'}
                days={days}
                updateDay={updateDay}
                startBalances={startBalances}
                selectedCurrencies={selectedCurrencies}
                displayCurrency={displayCurrency}
                exchangeRates={exchangeRates}
                budgetYear={budgetDate.year}
                budgetMonth={budgetDate.month}
              />

              <DaysCards
                isUk={language === 'uk'}
                days={days}
                updateDay={updateDay}
                startBalances={startBalances}
                selectedCurrencies={selectedCurrencies}
                displayCurrency={displayCurrency}
                exchangeRates={exchangeRates}
                budgetYear={budgetDate.year}
                budgetMonth={budgetDate.month}
              />

              <Statistics
                isUk={language === 'uk'}
                totals={totals}
                selectedCurrencies={selectedCurrencies}
                displayCurrency={displayCurrency}
                exchangeRates={exchangeRates}
              />

              <Analytics
                days={days}
                selectedCurrencies={selectedCurrencies}
                displayCurrency={displayCurrency}
                exchangeRates={exchangeRates}
                startBalances={startBalances}
                budgetYear={budgetDate.year}
                budgetMonth={budgetDate.month}
              />
            </>
          )}
        </div>
      </div>
      <Footer language={language} />
      
      {/* Модальні вікна */}
      <PromptModal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        onConfirm={handlePromptConfirm}
        title={translate('settings.budget.namePrompt')}
        confirmButtonText={translate('common.create')}
        cancelButtonText={translate('common.cancel')}
      />
      
      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        message={alertMessage}
        type={alertType}
        buttonText={translate('common.ok')}
      />
      
      <AlertModal
        isOpen={showSettingsAlertModal}
        onClose={() => setShowSettingsAlertModal(false)}
        message={settingsAlertMessage}
        type={settingsAlertType}
        buttonText={translate('common.ok')}
      />
      
      {/* ConfirmModal для очищення всіх полів */}
      <ConfirmModal
        isOpen={showClearAllConfirmModal}
        onClose={handleCancelClearAll}
        onConfirm={handleConfirmClearAll}
        title={translate('settings.clearAllConfirm.title')}
        message={translate('settings.clearAllConfirm.message')}
        confirmButtonText={translate('settings.clearAllConfirm.confirm')}
        cancelButtonText={translate('settings.clearAllConfirm.cancel')}
      />
      
      {/* ConfirmModal для очищення всіх днів */}
      <ConfirmModal
        isOpen={showClearAllDaysConfirmModal}
        onClose={handleCancelClearAllDays}
        onConfirm={handleConfirmClearAllDays}
        title={translate('settings.clearAllDaysConfirm.title')}
        message={translate('settings.clearAllDaysConfirm.message')}
        confirmButtonText={translate('settings.clearAllDaysConfirm.confirm')}
        cancelButtonText={translate('settings.clearAllDaysConfirm.cancel')}
      />
      
      {/* ConfirmModal для видалення бюджету */}
      <ConfirmModal
        isOpen={showDeleteBudgetConfirmModal}
        onClose={handleCancelDeleteBudget}
        onConfirm={handleConfirmDeleteBudget}
        title={translate('settings.budget.deleteConfirm.title')}
        message={translate('settings.budget.deleteConfirm.message', { budgetName: budgetToDeleteName || translate('settings.budget.untitled') })}
        confirmButtonText={translate('settings.budget.deleteConfirm.confirm')}
        cancelButtonText={translate('settings.budget.deleteConfirm.cancel')}
      />

      {/* ImportModal для розумного імпорту */}
      <ImportModal
        isOpen={showImportModal}
        onClose={cancelImport}
        onCreateNew={() => resolveImport('new')}
        onOverwrite={() => resolveImport('overwrite')}
        savedAt={pendingImport?.savedAt || null}
        budgetName={pendingImport?.budgetName || pendingImport?.settings?.name || translate('budget.main')}
        canCreateNew={Object.keys(budgets).length < 3}
        currentBudgetsCount={Object.keys(budgets).length}
      />

      {/* PromptModal для редагування назви бюджету */}
      <PromptModal
        isOpen={showEditNameModal}
        onClose={handleCancelEditName}
        onConfirm={handleEditNameConfirm}
        title={translate('settings.budget.editNameTitle')}
        placeholder={translate('settings.budget.editNamePlaceholder')}
        defaultValue={editingBudgetId && budgets[editingBudgetId] ? budgets[editingBudgetId].name : ''}
        confirmButtonText={translate('common.save')}
        cancelButtonText={translate('common.cancel')}
      />
    </div>
  );
}

