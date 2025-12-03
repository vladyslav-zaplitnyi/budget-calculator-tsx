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
    startBalanceUAH: number | null;
    startBalanceUSD: number | null;
    startBalanceEUR: number | null;
    usdRate: number;
    eurRate: number;
    selectedCurrencies: string[];
    exchangeRates: ExchangeRates;
    days: Day[];
  }>;
  setSyncStatus: (status: string) => void;
  getSyncStatusText: (key: string) => string;
  encryptionPassword?: string | null;
  setIsEncrypted?: (encrypted: boolean) => void;
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
  setIsEncrypted
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
      const safeBudgets: Budgets = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: 'Основний',
          startBalanceUAH: latestData.startBalanceUAH,
          startBalanceUSD: latestData.startBalanceUSD,
          startBalanceEUR: latestData.startBalanceEUR,
          usdRate: latestData.usdRate,
          eurRate: latestData.eurRate,
          selectedCurrencies: latestData.selectedCurrencies,
          exchangeRates: latestData.exchangeRates,
          days: latestData.days
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
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, latestDataRef, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted]);

  return saveTimeoutRef;
}

