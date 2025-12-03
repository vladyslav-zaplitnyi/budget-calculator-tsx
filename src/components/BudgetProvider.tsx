import React, { useMemo, useCallback, ReactNode, useState, useEffect } from 'react';
import { BudgetContext, BudgetContextValue, BudgetStateWithSync } from '../contexts/BudgetContext';
import { useBudgetState } from '../hooks/useBudgetState';
import { useBudgetSync } from '../hooks/useBudgetSync';
import { useCurrencyRates } from '../hooks/useCurrencyRates';
import { useAuth } from '../hooks/useAuth';

interface BudgetProviderProps {
  children: ReactNode;
}

export function BudgetProvider({ children }: BudgetProviderProps) {
  const budgetState = useBudgetState();
  const { user, loading: authLoading, loginWithGoogle, logout } = useAuth();
  
  // Функція для отримання тексту статусу синхронізації
  const getSyncStatusText = useCallback((statusType: string) => {
    if (budgetState.isUk) {
      switch (statusType) {
        case 'saved':
          return '☁️ Збережено';
        case 'error':
          return '❌ Помилка';
        case 'syncing':
          return '⏳ Синхронізація...';
        case 'local':
        default:
          return '💾 Локально';
      }
    } else {
      switch (statusType) {
        case 'saved':
          return '☁️ Saved';
        case 'error':
          return '❌ Error';
        case 'syncing':
          return '⏳ Syncing...';
        case 'local':
        default:
          return '💾 Local';
      }
    }
  }, [budgetState.isUk]);

  // Ініціалізуємо статус синхронізації
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatusText('local'));
  
  // Додаємо syncStatus до budgetState (мемоізуємо для стабільності)
  const budgetStateWithSync: BudgetStateWithSync = useMemo(() => ({
    ...budgetState,
    syncStatus,
    setSyncStatus,
    getSyncStatusText
  }), [budgetState, syncStatus, getSyncStatusText]);

  // Використовуємо синхронізацію
  useBudgetSync(budgetStateWithSync, getSyncStatusText, user, authLoading);
  
  // Використовуємо курси валют
  const currencyRates = useCurrencyRates(budgetStateWithSync);

  // Оновлюємо текст статусу синхронізації при зміні мови
  useEffect(() => {
    let statusType = 'local';
    if (syncStatus.includes('Збережено') || syncStatus.includes('Saved')) {
      statusType = 'saved';
    } else if (syncStatus.includes('Помилка') || syncStatus.includes('Error')) {
      statusType = 'error';
    } else if (syncStatus.includes('Синхронізація') || syncStatus.includes('Syncing')) {
      statusType = 'syncing';
    } else {
      statusType = 'local';
    }
    setSyncStatus(getSyncStatusText(statusType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetState.language, getSyncStatusText]);

  // Мемоізуємо value для контексту, щоб уникнути зайвих ререндерів
  const value: BudgetContextValue = useMemo(() => ({
    ...budgetStateWithSync,
    ...currencyRates,
    user,
    authLoading,
    loginWithGoogle,
    logout
  }), [budgetStateWithSync, currencyRates, user, authLoading, loginWithGoogle, logout]);

  return (
    <BudgetContext.Provider value={value}>
      {children}
    </BudgetContext.Provider>
  );
}

