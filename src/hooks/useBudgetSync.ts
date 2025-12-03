import { useEffect, useRef } from 'react';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets } from '../types';
import { useFirestoreSync } from './useFirestoreSync';
import { useBudgetStateSync } from './useBudgetStateSync';
import { useSyncDebounce } from './useSyncDebounce';

/**
 * Головний hook для синхронізації бюджету
 * Композиція менших хуків для завантаження, синхронізації та збереження даних
 */
export function useBudgetSync(
  budgetState: BudgetStateWithSync, 
  getSyncStatusText: (key: string) => string, 
  user: User | null, 
  authLoading: boolean
) {
  const {
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    usdRate,
    eurRate,
    selectedCurrencies,
    exchangeRates,
    days,
    activeBudgetId,
    budgets,
    isInitialLoad,
    setSyncStatus
  } = budgetState;

  const latestDataRef = useRef({
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    usdRate,
    eurRate,
    selectedCurrencies,
    exchangeRates,
    days
  });
  const loadedBudgetsRef = useRef<Budgets | null>(null);

  // Завантаження даних з Firestore
  useFirestoreSync(budgetState, getSyncStatusText, user, authLoading, loadedBudgetsRef);

  // Синхронізація стану бюджету
  useBudgetStateSync(budgetState, loadedBudgetsRef);

  // Оновлення ref з останніми значеннями для fallback
  useEffect(() => {
    latestDataRef.current = {
      startBalanceUAH,
      startBalanceUSD,
      startBalanceEUR,
      usdRate,
      eurRate,
      selectedCurrencies,
      exchangeRates,
      days
    };
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, selectedCurrencies, exchangeRates, days]);

  // Автоматичне збереження в localStorage при зміні даних
  useEffect(() => {
    if (isInitialLoad || authLoading) return;

    saveToLocalStorage(
      startBalanceUAH, 
      startBalanceUSD, 
      startBalanceEUR, 
      usdRate, 
      eurRate, 
      days, 
      selectedCurrencies, 
      exchangeRates,
      budgets,
      activeBudgetId
    );
    
    if (!user) {
      setSyncStatus(getSyncStatusText('local'));
    }
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, days, selectedCurrencies, exchangeRates, budgets, activeBudgetId, isInitialLoad, authLoading, user, setSyncStatus, getSyncStatusText]);

  // Debounce збереження в Firestore
  useSyncDebounce({
    budgets,
    activeBudgetId,
    user,
    isInitialLoad,
    authLoading,
    latestDataRef,
    setSyncStatus,
    getSyncStatusText
  });

  return {
    user,
    authLoading
  };
}
