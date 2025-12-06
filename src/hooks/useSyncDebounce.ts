import { useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Budgets, Day, ExchangeRates } from '../types';
import { saveToFirestore } from '../utils/storageHelpers';
import { DEFAULT_CURRENCIES } from '../utils/currencies';

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
  isUk?: boolean;
  // 🔒 ЗАПОБІЖНИК: Прапорець, чи є зашифровані дані в Firestore
  isRemoteDataEncrypted?: boolean;
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
 * РЕЗУЛЬТАТ БЛОКУВАННЯ:
 * - Запис у Firestore НЕ відбувається
 * - Виводиться попередження в консоль
 * - Статус встановлюється на 'local'
 * 
 * Це гарантує, що зашифровані дані НІКОЛИ не будуть перезаписані порожніми даними.
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
  isUk = true,
  isRemoteDataEncrypted = false
}: UseSyncDebounceParams) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitialLoad || authLoading || !user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSyncStatus(getSyncStatusText('syncing'));
    saveTimeoutRef.current = setTimeout(() => {
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
      
      // Використовуємо budgets безпосередньо, оскільки вони вже містять всі необхідні дані
      saveToFirestore(user, budgets, currentId, false, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted, isUk, isRemoteDataEncrypted]);

  return saveTimeoutRef;
}

