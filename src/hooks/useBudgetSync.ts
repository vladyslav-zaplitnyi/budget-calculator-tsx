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
    setIsEncrypted
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

    // ВАЖЛИВО: Перевіряємо, чи budgets не порожній перед збереженням
    // Це запобігає перезапису даних порожнім об'єктом після імпорту
    if (!budgets || Object.keys(budgets).length === 0) {
      console.log('⚠️ useBudgetSync: budgets порожній, пропускаємо збереження');
      return;
    }

    // Перевіряємо, чи активний бюджет існує і містить дані
    const currentId = activeBudgetId || 'default';
    const currentBudget = budgets[currentId];
    if (!currentBudget) {
      console.log('⚠️ useBudgetSync: активний бюджет не знайдено, пропускаємо збереження');
      return;
    }

    // ВАЖЛИВО: Перевіряємо, чи в localStorage вже є валідні дані
    // Якщо є, і поточний бюджет порожній (немає днів, балансів), не перезаписуємо
    // Це запобігає втраті даних після імпорту
    if (!user) {
      try {
        const existingData = localStorage.getItem('budgetTrackerData');
        if (existingData) {
          const parsed = JSON.parse(existingData);
          if (parsed.budgets && parsed.budgets[currentId]) {
            const existingBudget = parsed.budgets[currentId];
            // Якщо існуючий бюджет має дані, а поточний порожній - не перезаписуємо
            const existingHasData = (existingBudget.days && existingBudget.days.length > 0) ||
                                   (existingBudget.startBalances && Object.keys(existingBudget.startBalances).length > 0);
            const currentHasData = (currentBudget.days && currentBudget.days.length > 0) ||
                                  (currentBudget.startBalances && Object.keys(currentBudget.startBalances).length > 0);
            
            if (existingHasData && !currentHasData) {
              console.log('⚠️ useBudgetSync: існуючі дані в localStorage, поточний бюджет порожній - пропускаємо збереження');
              return;
            }
          }
        }
      } catch (e) {
        // Якщо помилка парсингу - продовжуємо збереження
        console.warn('⚠️ Помилка перевірки localStorage:', e);
      }
    }

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
    // 🔒 ЗАПОБІЖНИК: Передаємо стан зашифрованих даних
    isRemoteDataEncrypted: passwordModal.isRemoteDataEncrypted
  });

  return {
    user,
    authLoading,
    ...passwordModal
  };
}
