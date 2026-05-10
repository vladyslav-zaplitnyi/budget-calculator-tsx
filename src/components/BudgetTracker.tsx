import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Footer from './Footer';
import Header from './Header';
import SettingsCard from './SettingsCard';
import BudgetStatus from './BudgetStatus';
import DaysTable from './DaysTable';
import DaysCards from './DaysCards';
import Statistics from './Statistics';
import Analytics from './Analytics';
import AppTabs, { BudgetAppTab } from './AppTabs';
import OverviewDashboard from './OverviewDashboard';
import TransactionExplorer from './TransactionExplorer';
import MonthlyPlanner, { MonthlyPlannerHandle } from './MonthlyPlanner';
import AlertModal from './AlertModal';
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';
import ImportModal from './ImportModal';
import { useBudgetContext } from '../contexts/BudgetContext';
import { useBudgetHandlers } from '../hooks/useBudgetHandlers';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';
import { Budgets, Transaction } from '../types';
import { getDefaultPlannerStart } from '../utils/monthlyPlan';
import { translate } from '../i18n/config';
import { BUDGET_VIEW_MODE_IMPORT_EVENT } from '../hooks/useBudgetImportExport';

const APP_TAB_STORAGE_KEY = 'budget_tracker_active_tab';
const BUDGET_VIEW_MODE_STORAGE_KEY = 'budget_tracker_budget_view_mode';

type BudgetViewMode = 'days' | 'months';

const isBudgetViewMode = (value: string | null): value is BudgetViewMode => (
  value === 'days' || value === 'months'
);

const isBudgetAppTab = (value: string | null): value is BudgetAppTab => (
  value === 'budget' ||
  value === 'overview' ||
  value === 'insights'
);

const normalizeStoredTab = (value: string | null): BudgetAppTab => {
  if (value === 'transactions' || value === 'settings') return 'budget';
  return isBudgetAppTab(value) ? value : 'budget';
};

export default function BudgetTracker() {
  const context = useBudgetContext();
  const handlers = useBudgetHandlers();
  const monthlyPlannerRef = useRef<MonthlyPlannerHandle>(null);

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
    setBudgets,
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

  const [activeTab, setActiveTab] = useState<BudgetAppTab>(() => {
    try {
      if (typeof window === 'undefined') return 'budget';
      const stored = window.localStorage.getItem(APP_TAB_STORAGE_KEY);
      return normalizeStoredTab(stored);
    } catch {
      return 'budget';
    }
  });

  const handleTabChange = (tab: BudgetAppTab) => {
    setActiveTab(tab);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(APP_TAB_STORAGE_KEY, tab);
      }
    } catch {
      // ignore storage errors
    }
  };

  const [budgetViewMode, setBudgetViewMode] = useState<BudgetViewMode>(() => {
    try {
      if (typeof window === 'undefined') return 'days';
      const stored = window.localStorage.getItem(BUDGET_VIEW_MODE_STORAGE_KEY);
      return isBudgetViewMode(stored) ? stored : 'days';
    } catch {
      return 'days';
    }
  });

  const handleBudgetViewModeChange = (mode: BudgetViewMode) => {
    setBudgetViewMode(mode);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(BUDGET_VIEW_MODE_STORAGE_KEY, mode);
      }
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onImported = (e: Event) => {
      const ce = e as CustomEvent<BudgetViewMode>;
      if (ce.detail === 'days' || ce.detail === 'months') {
        setBudgetViewMode(ce.detail);
      }
    };
    window.addEventListener(BUDGET_VIEW_MODE_IMPORT_EVENT, onImported as EventListener);
    return () =>
      window.removeEventListener(BUDGET_VIEW_MODE_IMPORT_EVENT, onImported as EventListener);
  }, []);

  // Plans for future months are stored on the active budget so they sync to
  // Firestore/localStorage alongside everything else.
  const activeBudgetIdSafe = activeBudgetId || 'default';
  const monthlyPlans = useMemo<Record<string, Transaction[]>>(() => {
    const active = budgets && budgets[activeBudgetIdSafe];
    return (active && active.monthlyPlans) || {};
  }, [budgets, activeBudgetIdSafe]);

  const updateMonthlyPlan = useCallback((monthKey: string, transactions: Transaction[]) => {
    setBudgets((prev: Budgets) => {
      const safePrev = prev || {};
      const existingBudget = safePrev[activeBudgetIdSafe];
      if (!existingBudget) return safePrev;
      const prevPlans = existingBudget.monthlyPlans || {};
      const nextPlans: Record<string, Transaction[]> = { ...prevPlans };
      if (!transactions || transactions.length === 0) {
        delete nextPlans[monthKey];
      } else {
        nextPlans[monthKey] = transactions;
      }
      return {
        ...safePrev,
        [activeBudgetIdSafe]: {
          ...existingBudget,
          monthlyPlans: nextPlans
        }
      };
    });
  }, [setBudgets, activeBudgetIdSafe]);

  const bulkUpdateMonthlyPlans = useCallback((updates: Record<string, Transaction[]>) => {
    if (!updates || Object.keys(updates).length === 0) return;
    setBudgets((prev: Budgets) => {
      const safePrev = prev || {};
      const existingBudget = safePrev[activeBudgetIdSafe];
      if (!existingBudget) return safePrev;
      const nextPlans: Record<string, Transaction[]> = { ...(existingBudget.monthlyPlans || {}) };
      Object.entries(updates).forEach(([key, transactions]) => {
        if (!transactions || transactions.length === 0) {
          delete nextPlans[key];
        } else {
          nextPlans[key] = transactions;
        }
      });
      return {
        ...safePrev,
        [activeBudgetIdSafe]: {
          ...existingBudget,
          monthlyPlans: nextPlans
        }
      };
    });
  }, [setBudgets, activeBudgetIdSafe]);

  // Persisted rolling-window position (per budget). Falls back to "next month
  // after the budget month" so each budget remembers its planning view.
  const activeBudgetData = budgets && budgets[activeBudgetIdSafe];
  const defaultPlannerStart = useMemo(
    () => getDefaultPlannerStart(budgetDate.year, budgetDate.month),
    [budgetDate.year, budgetDate.month]
  );
  const plannerStartYear = (activeBudgetData?.plannerStartYear ?? defaultPlannerStart.year);
  const plannerStartMonth = (activeBudgetData?.plannerStartMonth ?? defaultPlannerStart.month);
  const plannerExpandedMonth = activeBudgetData?.plannerExpandedMonth ?? null;

  const setPlannerStart = useCallback((year: number, month: number) => {
    setBudgets((prev: Budgets) => {
      const safePrev = prev || {};
      const existingBudget = safePrev[activeBudgetIdSafe];
      if (!existingBudget) return safePrev;
      return {
        ...safePrev,
        [activeBudgetIdSafe]: {
          ...existingBudget,
          plannerStartYear: year,
          plannerStartMonth: month
        }
      };
    });
  }, [setBudgets, activeBudgetIdSafe]);

  const setPlannerExpandedMonth = useCallback((key: string | null) => {
    setBudgets((prev: Budgets) => {
      const safePrev = prev || {};
      const existingBudget = safePrev[activeBudgetIdSafe];
      if (!existingBudget) return safePrev;
      return {
        ...safePrev,
        [activeBudgetIdSafe]: {
          ...existingBudget,
          plannerExpandedMonth: key
        }
      };
    });
  }, [setBudgets, activeBudgetIdSafe]);

  const handleOpenPlannedTransactionFromSettings = useCallback(() => {
    const preset = plannerExpandedMonth ? [plannerExpandedMonth] : [];
    monthlyPlannerRef.current?.openAddPlannedModal(preset);
  }, [plannerExpandedMonth]);

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
              <AppTabs activeTab={activeTab} onChange={handleTabChange} />

              {activeTab === 'overview' && (
                <>
                  <OverviewDashboard
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

              {activeTab === 'budget' && (
                <>
                  <div className="rounded-2xl bg-white shadow-md border border-slate-200 p-1.5 mb-4 sm:mb-6">
                    <div
                      className="grid grid-cols-2 gap-1.5"
                      role="tablist"
                      aria-label={translate('budgetView.ariaLabel')}
                    >
                      {(['days', 'months'] as BudgetViewMode[]).map((mode) => {
                        const isActive = budgetViewMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => handleBudgetViewModeChange(mode)}
                            className={`appearance-none px-3 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                              isActive
                                ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white shadow-md'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <span className="block truncate">
                              {translate(`budgetView.${mode}`)}
                            </span>
                            <span className={`hidden sm:block text-[11px] font-medium mt-0.5 ${
                              isActive ? 'text-blue-100' : 'text-slate-500'
                            }`}>
                              {translate(`budgetView.${mode}Hint`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

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
                    budgetViewMode={budgetViewMode}
                    onAddPlannedTransaction={handleOpenPlannedTransactionFromSettings}
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
                    budgetViewMode={budgetViewMode}
                    monthlyPlans={monthlyPlans}
                    plannerStartYear={plannerStartYear}
                    plannerStartMonth={plannerStartMonth}
                  />

                  {budgetViewMode === 'days' && (
                    <>
                      <TransactionExplorer
                        days={days}
                        selectedCurrencies={selectedCurrencies}
                        displayCurrency={displayCurrency}
                        exchangeRates={exchangeRates}
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
                    </>
                  )}

                  {budgetViewMode === 'months' && (
                    <MonthlyPlanner
                      ref={monthlyPlannerRef}
                      isUk={language === 'uk'}
                      monthlyPlans={monthlyPlans}
                      updateMonthlyPlan={updateMonthlyPlan}
                      bulkUpdateMonthlyPlans={bulkUpdateMonthlyPlans}
                      budgetYear={budgetDate.year}
                      budgetMonth={budgetDate.month}
                      plannerStartYear={plannerStartYear}
                      plannerStartMonth={plannerStartMonth}
                      setPlannerStart={setPlannerStart}
                      expandedMonth={plannerExpandedMonth}
                      setExpandedMonth={setPlannerExpandedMonth}
                      selectedCurrencies={selectedCurrencies}
                      displayCurrency={displayCurrency}
                      exchangeRates={exchangeRates}
                      startingBalance={totalInDisplayCurrency}
                    />
                  )}
                </>
              )}

              {activeTab === 'insights' && (
                <>
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

