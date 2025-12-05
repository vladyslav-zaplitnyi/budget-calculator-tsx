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
}

/**
 * Hook для debounce збереження в Firestore
 * Використовує 2 секунди затримки перед збереженням
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
  isUk = true
}: UseSyncDebounceParams) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitialLoad || authLoading || !user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSyncStatus(getSyncStatusText('syncing'));
    saveTimeoutRef.current = setTimeout(() => {
      const latestData = latestDataRef.current;
      // ВАЖЛИВО: Використовуємо budgets, які вже містять правильні startBalances
      // Не використовуємо хардкодні значення startBalanceUAH/USD/EUR
      const safeBudgets: Budgets = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: isUk ? 'Основний' : 'Main',
          startBalances: {},
          selectedCurrencies: latestData.selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: latestData.exchangeRates || {},
          days: latestData.days || []
        }
      };
      const currentId = activeBudgetId || 'default';
      saveToFirestore(user, safeBudgets, currentId, false, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, latestDataRef, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted, isUk]);

  return saveTimeoutRef;
}

