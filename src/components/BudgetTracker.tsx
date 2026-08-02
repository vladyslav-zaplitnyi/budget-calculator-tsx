import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import BudgetViewToggle, { BudgetViewMode } from './BudgetViewToggle';
import TransactionExplorer from './TransactionExplorer';
import MultiMonthTransactionExplorer from './MultiMonthTransactionExplorer';
import TwelveMonthOverview from './TwelveMonthOverview';
import GuidedTour from './GuidedTour';
import BudgetMonthSection from './BudgetMonthSection';
import AlertModal from './AlertModal';
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';
import ImportModal from './ImportModal';
import { useBudgetContext } from '../contexts/BudgetContext';
import { useBudgetHandlers } from '../hooks/useBudgetHandlers';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';
import { aggregateTotalsForOverviewWindow } from '../utils/budgetInsights';
import { translate } from '../i18n/config';
import { BUDGET_VIEW_MODE_IMPORT_EVENT } from '../hooks/useBudgetImportExport';
import { monthKeyFromBudgetDate } from '../utils/rollingMonthsBudget';
import { simulateMonthsAfterNavigation } from '../utils/balanceWaterfall';
import { BUDGET_BOOK_CREATE_ENABLED } from '../utils/constants';
import { countTransactionsInDays } from '../utils/transactionLimits';

const MAX_BUDGET_BOOKS = 2;

const APP_TAB_STORAGE_KEY = 'budget_tracker_active_tab';
const BUDGET_VIEW_MODE_STORAGE_KEY = 'budget_tracker_budget_view_mode';

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
    budgetDate,
    setBudgetDate,
    isCurrentBookReadOnly,
    currentBudgetBookId,
    switchBudgetBook,
    isSwitchingBudgetBook,
    availableBudgetBooks,
    createBook,
    renameBook,
    deleteBook
  } = context;

  const {
    handleClearAllDays,
    showClearAllDaysConfirmModal,
    handleConfirmClearAllDays,
    handleCancelClearAllDays,
    clearDaysScope,
    handleClearStartBalances,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange,
    handleBulkAddTransactionsToMonths,
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

  const handleTabChange = useCallback((tab: BudgetAppTab) => {
    setActiveTab(tab);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(APP_TAB_STORAGE_KEY, tab);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const [budgetViewMode, setBudgetViewMode] = useState<BudgetViewMode>(() => {
    try {
      if (typeof window === 'undefined') return 'days';
      const stored = window.localStorage.getItem(BUDGET_VIEW_MODE_STORAGE_KEY);
      return isBudgetViewMode(stored) ? stored : 'days';
    } catch {
      return 'days';
    }
  });

  const handleBudgetViewModeChange = useCallback((mode: BudgetViewMode) => {
    setBudgetViewMode(mode);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(BUDGET_VIEW_MODE_STORAGE_KEY, mode);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

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

  const activeBudgetIdSafe = activeBudgetId || 'default';
  const activeBudgetData = budgets && budgets[activeBudgetIdSafe];
  const activeMonthKey = monthKeyFromBudgetDate(budgetDate.year, budgetDate.month);

  const monthRollingPreview = useMemo(
    () => ({
      monthsByKey: activeBudgetData?.monthsByKey,
      budgetDate: { year: budgetDate.year, month: budgetDate.month },
      uiDays: days,
      uiStartBalances: activeBudgetData?.startBalances ?? {},
      selectedCurrencies
    }),
    [
      activeBudgetData?.monthsByKey,
      activeBudgetData?.startBalances,
      budgetDate.year,
      budgetDate.month,
      days,
      selectedCurrencies
    ]
  );

  const [overviewMonthTrimConfirm, setOverviewMonthTrimConfirm] = useState<{
    year: number;
    month: number;
    forward: boolean;
  } | null>(null);

  const handleSelectMonthFromOverview = useCallback(
    (year: number, month: number) => {
      if (isCurrentBookReadOnly) return;
      const sim = simulateMonthsAfterNavigation({
        ...monthRollingPreview,
        oldDate: { year: budgetDate.year, month: budgetDate.month },
        newDate: { year, month }
      });
      if (!sim.exceeds) {
        setBudgetDate({ year, month });
        handleBudgetViewModeChange('days');
        return;
      }
      setOverviewMonthTrimConfirm({ year, month, forward: sim.forwardJump });
    },
    [
      isCurrentBookReadOnly,
      monthRollingPreview,
      budgetDate.year,
      budgetDate.month,
      setBudgetDate,
      handleBudgetViewModeChange
    ]
  );

  const handleOverviewMonthTrimConfirm = useCallback(() => {
    if (!overviewMonthTrimConfirm) return;
    setBudgetDate({
      year: overviewMonthTrimConfirm.year,
      month: overviewMonthTrimConfirm.month
    });
    handleBudgetViewModeChange('days');
    setOverviewMonthTrimConfirm(null);
  }, [overviewMonthTrimConfirm, setBudgetDate, handleBudgetViewModeChange]);

  const handleOverviewMonthTrimCancel = useCallback(() => {
    setOverviewMonthTrimConfirm(null);
  }, []);

  // Budget book (max 2) management modals
  const canCreateBook =
    BUDGET_BOOK_CREATE_ENABLED && !!user && availableBudgetBooks.length < MAX_BUDGET_BOOKS;
  const [bookModal, setBookModal] = useState<{ mode: 'create' | 'rename'; bookId?: string } | null>(null);
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null);

  const handleBookModalConfirm = useCallback(
    (name: string) => {
      const trimmed = (name || '').trim();
      if (!trimmed || !bookModal) {
        setBookModal(null);
        return;
      }
      if (bookModal.mode === 'create') {
        if (BUDGET_BOOK_CREATE_ENABLED) {
          void createBook(trimmed);
        }
      } else if (bookModal.bookId) {
        void renameBook(bookModal.bookId, trimmed);
      }
      setBookModal(null);
    },
    [bookModal, createBook, renameBook]
  );

  const handleConfirmDeleteBook = useCallback(() => {
    if (deleteBookId) {
      void deleteBook(deleteBookId);
    }
    setDeleteBookId(null);
  }, [deleteBookId, deleteBook]);

  // Effective opening for the selected month (carry-over) — used for day/status math
  const effectiveStartBalances = useMemo(() => {
    const sliceStarts = activeBudgetData?.monthsByKey?.[activeMonthKey]?.startBalances;
    const balances: Record<string, number | null> = {};
    selectedCurrencies.forEach((code) => {
      balances[code] =
        sliceStarts?.[code] ?? activeBudgetData?.startBalances?.[code] ?? null;
    });
    return balances;
  }, [
    selectedCurrencies,
    activeBudgetData?.monthsByKey,
    activeBudgetData?.startBalances,
    activeMonthKey
  ]);

  // Calculations
  const totals = useMemo(
    () => calculateTotals(days, selectedCurrencies),
    [days, selectedCurrencies]
  );

  const monthTransactionCount = useMemo(() => countTransactionsInDays(days), [days]);

  const twelveMonthTotals = useMemo(
    () =>
      aggregateTotalsForOverviewWindow({
        monthsByKey: activeBudgetData?.monthsByKey,
        selectedCurrencies,
        activeMonthKey,
        activeDays: days
      }),
    [activeBudgetData?.monthsByKey, selectedCurrencies, activeMonthKey, days]
  );

  const insightsTotals = budgetViewMode === 'months' ? twelveMonthTotals : totals;

  const finalBalances = useMemo(
    () => calculateFinalBalances(days, selectedCurrencies, effectiveStartBalances, totals),
    [days, selectedCurrencies, effectiveStartBalances, totals]
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
            availableBudgetBooks={availableBudgetBooks}
            currentBudgetBookId={currentBudgetBookId}
            onBudgetBookChange={(id) => void switchBudgetBook(id)}
            isSwitchingBudgetBook={isSwitchingBudgetBook}
            isCurrentBookReadOnly={isCurrentBookReadOnly}
            onCreateBookClick={
              BUDGET_BOOK_CREATE_ENABLED ? () => setBookModal({ mode: 'create' }) : undefined
            }
            onRenameBookClick={(id) => setBookModal({ mode: 'rename', bookId: id })}
            onDeleteBookClick={(id) => setDeleteBookId(id)}
            canCreateBook={canCreateBook}
          />

          {/* Приховуємо весь контент між Header і Footer, якщо потрібен пароль */}
          {!(showPasswordModal && user) && (
            <>
              <GuidedTour
                setActiveTab={handleTabChange}
                setBudgetViewMode={handleBudgetViewModeChange}
                setLanguage={setLanguage}
              />

              <div data-tour="tabs">
                <AppTabs activeTab={activeTab} onChange={handleTabChange} />
              </div>

              {(activeTab === 'budget' || activeTab === 'overview' || activeTab === 'insights') && (
                <div data-tour="view-toggle">
                  <BudgetViewToggle
                    mode={budgetViewMode}
                    onChange={handleBudgetViewModeChange}
                  />
                </div>
              )}

              {activeTab === 'overview' && (
                <div data-tour="overview-dashboard">
                  <OverviewDashboard
                    days={days}
                    selectedCurrencies={selectedCurrencies}
                    displayCurrency={displayCurrency}
                    exchangeRates={exchangeRates}
                    startBalances={effectiveStartBalances}
                    budgetYear={budgetDate.year}
                    budgetMonth={budgetDate.month}
                    budgetViewMode={budgetViewMode}
                    monthsByKey={activeBudgetData?.monthsByKey}
                    activeMonthKey={activeMonthKey}
                  />
                </div>
              )}

              {activeTab === 'budget' && (
                <>
                  <SettingsCard
                    isUk={language === 'uk'}
                    user={user}
                    budgets={budgets}
                    activeBudgetId={activeBudgetId}
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
                    handleClearAllDays={handleClearAllDays}
                    handleClearStartBalances={handleClearStartBalances}
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
                    monthsByKey={activeBudgetData?.monthsByKey}
                    activeMonthKey={monthKeyFromBudgetDate(budgetDate.year, budgetDate.month)}
                    onBulkAddTransactionsToMonths={handleBulkAddTransactionsToMonths}
                    readOnly={isCurrentBookReadOnly}
                  />

                  <div data-tour="budget-status">
                    <BudgetStatus
                      finalBalances={finalBalances}
                      startBalances={effectiveStartBalances}
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
                      activeMonthKey={activeMonthKey}
                      monthsByKey={activeBudgetData?.monthsByKey}
                      readOnly={isCurrentBookReadOnly}
                    />
                  </div>

                  {budgetViewMode === 'days' && (
                    <>
                      <BudgetMonthSection
                        budgetYear={budgetDate.year}
                        budgetMonth={budgetDate.month}
                        setBudgetDate={setBudgetDate}
                        rollingMonthPreview={monthRollingPreview}
                        readOnly={isCurrentBookReadOnly}
                        monthTransactionCount={monthTransactionCount}
                      />

                      <div data-tour="days-table">
                        <DaysTable
                          isUk={language === 'uk'}
                          days={days}
                          updateDay={updateDay}
                          startBalances={effectiveStartBalances}
                          selectedCurrencies={selectedCurrencies}
                          displayCurrency={displayCurrency}
                          exchangeRates={exchangeRates}
                          budgetYear={budgetDate.year}
                          budgetMonth={budgetDate.month}
                          readOnly={isCurrentBookReadOnly}
                        />

                        <DaysCards
                          isUk={language === 'uk'}
                          days={days}
                          updateDay={updateDay}
                          startBalances={effectiveStartBalances}
                          selectedCurrencies={selectedCurrencies}
                          displayCurrency={displayCurrency}
                          exchangeRates={exchangeRates}
                          budgetYear={budgetDate.year}
                          budgetMonth={budgetDate.month}
                          readOnly={isCurrentBookReadOnly}
                        />
                      </div>

                      <TransactionExplorer
                        days={days}
                        selectedCurrencies={selectedCurrencies}
                        displayCurrency={displayCurrency}
                        exchangeRates={exchangeRates}
                        budgetYear={budgetDate.year}
                        budgetMonth={budgetDate.month}
                      />
                    </>
                  )}

                  {budgetViewMode === 'months' && (
                    <>
                      <div data-tour="months-overview">
                        <TwelveMonthOverview
                          activeBudget={activeBudgetData}
                          selectedCurrencies={selectedCurrencies}
                          displayCurrency={displayCurrency}
                          exchangeRates={exchangeRates}
                          onSelectMonth={handleSelectMonthFromOverview}
                        />
                      </div>

                      <MultiMonthTransactionExplorer
                        monthsByKey={activeBudgetData?.monthsByKey}
                        selectedCurrencies={selectedCurrencies}
                        displayCurrency={displayCurrency}
                        exchangeRates={exchangeRates}
                      />
                    </>
                  )}
                </>
              )}

              {activeTab === 'insights' && (
                <>
                  <div data-tour="statistics">
                    <Statistics
                      isUk={language === 'uk'}
                      totals={insightsTotals}
                      selectedCurrencies={selectedCurrencies}
                      displayCurrency={displayCurrency}
                      exchangeRates={exchangeRates}
                    />
                  </div>

                  <div data-tour="analytics">
                    <Analytics
                      days={days}
                      selectedCurrencies={selectedCurrencies}
                      displayCurrency={displayCurrency}
                      exchangeRates={exchangeRates}
                      startBalances={effectiveStartBalances}
                      budgetYear={budgetDate.year}
                      budgetMonth={budgetDate.month}
                      budgetViewMode={budgetViewMode}
                      monthsByKey={activeBudgetData?.monthsByKey}
                      activeMonthKey={activeMonthKey}
                    />
                  </div>
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
      
      {/* Підтвердження обрізання rolling months при переході з 12-місячного огляду */}
      <ConfirmModal
        isOpen={overviewMonthTrimConfirm !== null}
        onClose={handleOverviewMonthTrimCancel}
        onConfirm={handleOverviewMonthTrimConfirm}
        title={translate('monthYearPicker.overflow.title')}
        message={
          overviewMonthTrimConfirm?.forward === true
            ? translate('monthYearPicker.overflow.forwardMessage')
            : translate('monthYearPicker.overflow.backwardMessage')
        }
        confirmButtonText={translate('monthYearPicker.overflow.proceed')}
        cancelButtonText={translate('monthYearPicker.overflow.cancel')}
      />

      {/* Створення / перейменування книги бюджету */}
      <PromptModal
        isOpen={bookModal !== null}
        onClose={() => setBookModal(null)}
        onConfirm={handleBookModalConfirm}
        title={
          bookModal?.mode === 'create'
            ? translate('budgetBook.createTitle')
            : translate('budgetBook.renameTitle')
        }
        placeholder={translate('budgetBook.namePlaceholder')}
        defaultValue={
          bookModal?.mode === 'rename'
            ? availableBudgetBooks.find((b) => b.id === bookModal.bookId)?.displayLabel || ''
            : ''
        }
        confirmButtonText={translate('common.save')}
        cancelButtonText={translate('common.cancel')}
      />

      {/* Видалення книги бюджету */}
      <ConfirmModal
        isOpen={deleteBookId !== null}
        onClose={() => setDeleteBookId(null)}
        onConfirm={handleConfirmDeleteBook}
        title={translate('budgetBook.deleteConfirmTitle')}
        message={translate('budgetBook.deleteConfirmMessage')}
        confirmButtonText={translate('budgetBook.delete')}
        cancelButtonText={translate('common.cancel')}
      />

      {/* ConfirmModal для очищення днів */}
      <ConfirmModal
        isOpen={showClearAllDaysConfirmModal}
        onClose={handleCancelClearAllDays}
        onConfirm={handleConfirmClearAllDays}
        title={translate(
          clearDaysScope === 'all-months'
            ? 'settings.clearAllDaysConfirm.title'
            : 'settings.clearMonthDaysConfirm.title'
        )}
        message={translate(
          clearDaysScope === 'all-months'
            ? 'settings.clearAllDaysConfirm.message'
            : 'settings.clearMonthDaysConfirm.message'
        )}
        confirmButtonText={translate(
          clearDaysScope === 'all-months'
            ? 'settings.clearAllDaysConfirm.confirm'
            : 'settings.clearMonthDaysConfirm.confirm'
        )}
        cancelButtonText={translate(
          clearDaysScope === 'all-months'
            ? 'settings.clearAllDaysConfirm.cancel'
            : 'settings.clearMonthDaysConfirm.cancel'
        )}
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
        canCreateNew={Object.keys(budgets).length < MAX_BUDGET_BOOKS}
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

