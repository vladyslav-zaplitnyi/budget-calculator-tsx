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
    handleDeleteBudget: budgetManagement.handleDeleteBudget,
    
    // Settings
    handleClearAll: budgetSettings.handleClearAll,
    handleClearAllDays: budgetSettings.handleClearAllDays,
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
    
    // Import/Export
    handleExportToJsonFile: budgetImportExport.handleExportToJsonFile,
    handleImportFromJsonFile: budgetImportExport.handleImportFromJsonFile,
    handleJsonFileSelected: budgetImportExport.handleJsonFileSelected,
    fileInputRef: budgetImportExport.fileInputRef
  };
}
