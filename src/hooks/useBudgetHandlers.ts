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
    handleCurrencyChange: budgetSettings.handleCurrencyChange,
    handleExchangeRateChange: budgetSettings.handleExchangeRateChange,
    handleStartBalanceChange: budgetSettings.handleStartBalanceChange,
    
    // Import/Export
    handleExportToJsonFile: budgetImportExport.handleExportToJsonFile,
    handleImportFromJsonFile: budgetImportExport.handleImportFromJsonFile,
    handleJsonFileSelected: budgetImportExport.handleJsonFileSelected,
    fileInputRef: budgetImportExport.fileInputRef
  };
}
