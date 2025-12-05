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
    selectedCurrencies,
    exchangeRates,
    days,
    activeBudgetId,
    budgets,
    isInitialLoad,
    setSyncStatus,
    encryptionPassword,
    setIsEncrypted,
    isUk
  } = budgetState;

  // ВАЖЛИВО: Не зберігаємо хардкодні значення startBalanceUAH/USD/EUR
  // Всі баланси зберігаються в budgets[activeBudgetId].startBalances
  const latestDataRef = useRef({
    selectedCurrencies,
    exchangeRates,
    days
  });
  const loadedBudgetsRef = useRef<Budgets | null>(null);

  // Завантаження даних з Firestore
  const passwordModal = useFirestoreSync(budgetState, getSyncStatusText, user, authLoading, loadedBudgetsRef);

  // Синхронізація стану бюджету
  useBudgetStateSync(budgetState, loadedBudgetsRef);

  // Оновлення ref з останніми значеннями для fallback
  useEffect(() => {
    latestDataRef.current = {
      selectedCurrencies,
      exchangeRates,
      days
    };
  }, [selectedCurrencies, exchangeRates, days]);

  // Автоматичне збереження в localStorage при зміні даних
  // Зберігаємо дані завжди, незалежно від авторизації
  useEffect(() => {
    if (isInitialLoad || authLoading) return;

    // Зберігаємо дані в localStorage завжди при зміні
    // ВАЖЛИВО: Всі баланси, курси, дні та вибрані валюти зберігаються
    // всередині об'єкта `budgets` (через useBudgetStateSync).
    saveToLocalStorage(budgets, activeBudgetId);
    
    // Оновлюємо статус синхронізації
    // Якщо користувач не авторизований, показуємо тільки локальний статус
    if (!user) {
      setSyncStatus(getSyncStatusText('local'));
    }
  }, [days, selectedCurrencies, exchangeRates, budgets, activeBudgetId, isInitialLoad, authLoading, user, setSyncStatus, getSyncStatusText]);

  // Debounce збереження в Firestore
  useSyncDebounce({
    budgets,
    activeBudgetId,
    user,
    isInitialLoad,
    authLoading,
    latestDataRef,
    setSyncStatus,
    getSyncStatusText,
    encryptionPassword,
    setIsEncrypted,
    isUk
  });

  return {
    user,
    authLoading,
    ...passwordModal
  };
}
