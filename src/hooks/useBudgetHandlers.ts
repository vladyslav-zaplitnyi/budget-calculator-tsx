import { useBudgetManagement } from './useBudgetManagement';
import { useBudgetSettings } from './useBudgetSettings';
import { useBudgetImportExport } from './useBudgetImportExport';

/**
 * Головний hook для обробки дій з бюджетом
 * Композиція менших хуків для управління, налаштувань та імпорту/експорту
 */
export function useBudgetHandlers() {
  const budgetManagement = useBudgetManagement();
  const budgetSettings = useBudgetSettings();
  const budgetImportExport = useBudgetImportExport();

      return {
    // Budget management
    handleBudgetChange: budgetManagement.handleBudgetChange,
    handleAddBudgetClick: budgetManagement.handleAddBudgetClick,
    handleEditBudgetClick: budgetManagement.handleEditBudgetClick,
    handleDeleteBudget: budgetManagement.handleDeleteBudget,
    showDeleteBudgetConfirmModal: budgetManagement.showDeleteBudgetConfirmModal,
    setShowDeleteBudgetConfirmModal: budgetManagement.setShowDeleteBudgetConfirmModal,
    handleConfirmDeleteBudget: budgetManagement.handleConfirmDeleteBudget,
    handleCancelDeleteBudget: budgetManagement.handleCancelDeleteBudget,
    budgetToDeleteName: budgetManagement.budgetToDeleteName,
    showPromptModal: budgetManagement.showPromptModal,
    setShowPromptModal: budgetManagement.setShowPromptModal,
    handlePromptConfirm: budgetManagement.handlePromptConfirm,
    showAlertModal: budgetManagement.showAlertModal,
    setShowAlertModal: budgetManagement.setShowAlertModal,
    alertMessage: budgetManagement.alertMessage,
    alertType: budgetManagement.alertType,
    // Edit budget name
    showEditNameModal: budgetManagement.showEditNameModal,
    setShowEditNameModal: budgetManagement.setShowEditNameModal,
    handleEditNameConfirm: budgetManagement.handleEditNameConfirm,
    handleCancelEditName: budgetManagement.handleCancelEditName,
    editingBudgetId: budgetManagement.editingBudgetId,
    
    // Settings
    handleClearAll: budgetSettings.handleClearAll,
    handleClearAllDays: budgetSettings.handleClearAllDays,
    showClearAllConfirmModal: budgetSettings.showClearAllConfirmModal,
    setShowClearAllConfirmModal: budgetSettings.setShowClearAllConfirmModal,
    handleConfirmClearAll: budgetSettings.handleConfirmClearAll,
    handleCancelClearAll: budgetSettings.handleCancelClearAll,
    showClearAllDaysConfirmModal: budgetSettings.showClearAllDaysConfirmModal,
    setShowClearAllDaysConfirmModal: budgetSettings.setShowClearAllDaysConfirmModal,
    handleConfirmClearAllDays: budgetSettings.handleConfirmClearAllDays,
    handleCancelClearAllDays: budgetSettings.handleCancelClearAllDays,
    handleStartNewMonth: budgetSettings.handleStartNewMonth,
    handleConfirmStartNewMonth: budgetSettings.handleConfirmStartNewMonth,
    handleCancelStartNewMonth: budgetSettings.handleCancelStartNewMonth,
    showStartNewMonthModal: budgetSettings.showStartNewMonthModal,
    handleCurrencyChange: budgetSettings.handleCurrencyChange,
    handleExchangeRateChange: budgetSettings.handleExchangeRateChange,
    handleStartBalanceChange: budgetSettings.handleStartBalanceChange,
    
    // Encryption
    handleEnableEncryptionClick: budgetSettings.handleEnableEncryptionClick,
    handleDisableEncryptionClick: budgetSettings.handleDisableEncryptionClick,
    handleEnableEncryption: budgetSettings.handleEnableEncryption,
    handleDisableEncryption: budgetSettings.handleDisableEncryption,
    showEnableEncryptionModal: budgetSettings.showEnableEncryptionModal,
    showDisableEncryptionModal: budgetSettings.showDisableEncryptionModal,
    setShowEnableEncryptionModal: budgetSettings.setShowEnableEncryptionModal,
    setShowDisableEncryptionModal: budgetSettings.setShowDisableEncryptionModal,
    isEncrypted: budgetSettings.isEncrypted,
    showSettingsAlertModal: budgetSettings.showAlertModal,
    setShowSettingsAlertModal: budgetSettings.setShowAlertModal,
    settingsAlertMessage: budgetSettings.alertMessage,
    settingsAlertType: budgetSettings.alertType,
    
    // Import/Export
    handleExportToJsonFile: budgetImportExport.handleExportToJsonFile,
    handleImportFromJsonFile: budgetImportExport.handleImportFromJsonFile,
    handleJsonFileSelected: budgetImportExport.handleJsonFileSelected,
    fileInputRef: budgetImportExport.fileInputRef,
    showImportModal: budgetImportExport.showImportModal,
    resolveImport: budgetImportExport.resolveImport,
    cancelImport: budgetImportExport.cancelImport,
    pendingImport: budgetImportExport.pendingImport
  };
}
