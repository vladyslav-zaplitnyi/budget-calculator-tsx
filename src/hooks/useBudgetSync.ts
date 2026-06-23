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
    currentBudgetBookId,
    isCurrentBookReadOnly
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

  // Допоміжна функція для перевірки наявності транзакцій в днях
  const hasTransactions = (daysArray: any[] | undefined): boolean => {
    if (!daysArray || !Array.isArray(daysArray)) return false;
    return daysArray.some(day => 
      day.transactions && Array.isArray(day.transactions) && day.transactions.length > 0
    );
  };

  // Допоміжна функція для перевірки наявності балансів
  const hasBalances = (balances: Record<string, number | null> | undefined): boolean => {
    if (!balances || typeof balances !== 'object') return false;
    return Object.values(balances).some(v => v !== null && v !== undefined && v !== 0);
  };

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

    // Перевіряємо, чи активний бюджет існує
    const currentId = activeBudgetId || 'default';
    const currentBudget = budgets[currentId];
    if (!currentBudget) {
      console.log('⚠️ useBudgetSync: активний бюджет не знайдено, пропускаємо збереження');
      return;
    }

    // ВАЖЛИВО: Перевіряємо, чи в localStorage вже є валідні дані для ІМПОРТОВАНИХ бюджетів
    // Перевіряємо тільки наявність ТРАНЗАКЦІЙ, а не просто кількість днів
    // Це запобігає втраті даних після імпорту, але дозволяє зберігати нові бюджети
    if (!user) {
      try {
        const existingData = localStorage.getItem('budgetTrackerData');
        if (existingData) {
          const parsed = JSON.parse(existingData);
          if (parsed.budgets && parsed.budgets[currentId]) {
            const existingBudget = parsed.budgets[currentId];
            
            // Перевіряємо наявність ТРАНЗАКЦІЙ (не просто днів) або балансів
            const existingHasRealData = hasTransactions(existingBudget.days) || hasBalances(existingBudget.startBalances);
            const currentHasRealData = hasTransactions(currentBudget.days) || hasBalances(currentBudget.startBalances);
            
            // Блокуємо тільки якщо існуючий має реальні дані, а поточний - порожній
            if (existingHasRealData && !currentHasRealData) {
              console.log('⚠️ useBudgetSync: існуючі транзакції в localStorage, поточний бюджет порожній - пропускаємо збереження');
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
    // ВАЖЛИВО: Об'єднуємо поточні days зі стану з budgets перед збереженням
    // Це гарантує, що найсвіжіші дані зберігаються, навіть якщо useBudgetStateSync ще не синхронізував
    const budgetsToSave: Budgets = {
      ...budgets,
      [currentId]: {
        ...currentBudget,
        days: days || currentBudget.days || [],
        selectedCurrencies: selectedCurrencies || currentBudget.selectedCurrencies,
        exchangeRates: exchangeRates || currentBudget.exchangeRates
      }
    };
    
    console.log('💾 Зберігаємо в localStorage:', currentId, 'транзакцій:', hasTransactions(budgetsToSave[currentId].days));
    saveToLocalStorage(budgetsToSave, activeBudgetId);
    
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
    isRemoteDataEncrypted: passwordModal.isRemoteDataEncrypted,
    // 🔒 FETCH-FIRST: Передаємо стан завантаження даних
    isDataLoaded: passwordModal.isDataLoaded,
    firestoreBudgetContext: user
      ? { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
      : null
  });

  return {
    user,
    authLoading,
    ...passwordModal
  };
}
