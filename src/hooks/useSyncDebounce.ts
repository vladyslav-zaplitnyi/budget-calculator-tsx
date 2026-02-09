import { useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Budgets, Day, ExchangeRates } from '../types';
import { saveToFirestore } from '../utils/storageHelpers';

interface UseSyncDebounceParams {
  budgets: Budgets;
  activeBudgetId: string | null;
  user: User | null;
  isInitialLoad: boolean;
  authLoading: boolean;
  latestDataRef: React.MutableRefObject<{
    selectedCurrencies: string[];
    exchangeRates: ExchangeRates;
    days: Day[];
  }>;
  setSyncStatus: (status: string) => void;
  getSyncStatusText: (key: string) => string;
  encryptionPassword?: string | null;
  setIsEncrypted?: (encrypted: boolean) => void;
  // 🔒 ЗАПОБІЖНИК: Прапорець, чи є зашифровані дані в Firestore
  isRemoteDataEncrypted?: boolean;
  // 🔒 FETCH-FIRST: Прапорець, чи дані завантажені з хмари
  isDataLoaded?: boolean;
}

/**
 * Hook для debounce збереження в Firestore
 * Використовує 2 секунди затримки перед збереженням
 * 
 * 🔒 WRITE GUARD (ЗАПОБІЖНИК ЗАПИСУ):
 * Перед збереженням перевіряє, чи можна безпечно записувати дані:
 * 
 * БЛОКУВАННЯ ЗАПИСУ, ЯКЩО:
 * - isRemoteDataEncrypted === true (в Firestore є зашифровані дані)
 * - encryptionPassword === null (пароль не введено)
 * 
 * 🔒 FETCH-FIRST (СПОЧАТКУ ЗАВАНТАЖИТИ):
 * Додаткова перевірка для запобігання перезапису даних з хмари:
 * 
 * БЛОКУВАННЯ ЗАПИСУ, ЯКЩО:
 * - isDataLoaded === false (дані з Firestore ще не завантажені)
 * 
 * РЕЗУЛЬТАТ БЛОКУВАННЯ:
 * - Запис у Firestore НЕ відбувається
 * - Виводиться попередження в консоль
 * - Статус встановлюється на 'local'
 * 
 * Це гарантує правильну послідовність: Login -> Fetch -> Update State -> Unlock Auto-save
 */
export function useSyncDebounce({
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
  isRemoteDataEncrypted = false,
  isDataLoaded = false
}: UseSyncDebounceParams) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitialLoad || authLoading || !user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSyncStatus(getSyncStatusText('syncing'));
    saveTimeoutRef.current = setTimeout(() => {
      // 🔒 FETCH-FIRST: Якщо дані ще не завантажені з хмари — НІЧОГО НЕ ПИШЕМО!
      if (!isDataLoaded) {
        console.warn('⛔ Блокування запису: Дані з Firestore ще не завантажені. Очікуємо завершення завантаження...');
        setSyncStatus(getSyncStatusText('local'));
        return;
      }
      
      // 🔒 ЗАПОБІЖНИК ЗАПИСУ: Якщо в хмарі дані зашифровані, але у нас немає пароля — НІЧОГО НЕ ПИШЕМО!
      if (isRemoteDataEncrypted && !encryptionPassword) {
        console.warn('⛔ Блокування запису: Спроба перезаписати зашифровані дані без пароля!');
        setSyncStatus(getSyncStatusText('local'));
        return;
      }
      // ВАЖЛИВО: Використовуємо budgets, які вже містять правильні startBalances
      // Не використовуємо хардкодні значення startBalanceUAH/USD/EUR
      // ВАЖЛИВО: Якщо budgets порожній, це означає, що дані ще не завантажені з БД,
      // тому не зберігаємо, щоб уникнути перезапису даних з БД локальними даними
      if (!budgets || Object.keys(budgets).length === 0) {
        console.log('⚠️ useSyncDebounce: budgets порожній, пропускаємо збереження');
        setSyncStatus(getSyncStatusText('local'));
        return;
      }
      
      const currentId = activeBudgetId || 'default';
      const currentBudget = budgets[currentId];
      
      // ВАЖЛИВО: Перевіряємо, чи активний бюджет існує і містить дані
      // Якщо ні, не зберігаємо, щоб уникнути перезапису даних з БД
      if (!currentBudget) {
        console.log('⚠️ useSyncDebounce: активний бюджет не знайдено, пропускаємо збереження');
        setSyncStatus(getSyncStatusText('local'));
        return;
      }
      
      // ВАЖЛИВО: Об'єднуємо поточні days зі стану з budgets перед збереженням
      // Це гарантує, що найсвіжіші дані зберігаються в Firestore
      const budgetsToSave: Budgets = {
        ...budgets,
        [currentId]: {
          ...currentBudget,
          days: latestDataRef.current.days || currentBudget.days || [],
          selectedCurrencies: latestDataRef.current.selectedCurrencies || currentBudget.selectedCurrencies,
          exchangeRates: latestDataRef.current.exchangeRates || currentBudget.exchangeRates
        }
      };
      
      saveToFirestore(user, budgetsToSave, currentId, false, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, latestDataRef, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted, isRemoteDataEncrypted, isDataLoaded]);

  return saveTimeoutRef;
}

