import { useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Budgets, Day, ExchangeRates } from '../types';
import { saveToFirestore, FirestoreBudgetContext } from '../utils/storageHelpers';
import { markLocalChangesDirty, clearLocalChangesDirty } from '../utils/localChangesFlag';

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
  /** Active Firestore budget book; writes are skipped when read-only. */
  firestoreBudgetContext?: FirestoreBudgetContext | null;
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
  isDataLoaded = false,
  firestoreBudgetContext = null
}: UseSyncDebounceParams) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Остання відкладена операція збереження та книга, до якої вона належить.
  // Потрібні, щоб не втратити зміни, якщо користувач перемикає книгу бюджету
  // раніше, ніж спрацює 2-секундний debounce.
  const pendingSaveRef = useRef<(() => void | Promise<void>) | null>(null);
  const lastBookIdRef = useRef<string | null>(null);

  // Якщо компонент розмонтовано з незавершеним записом — не залишаємо прапорець
  // "брудних" даних увімкненим, інакше realtime-оновлення перестануть застосовуватись.
  useEffect(() => () => clearLocalChangesDirty(), []);

  useEffect(() => {
    const currentBookId = firestoreBudgetContext?.budgetBookId ?? null;

    if (isInitialLoad || authLoading || !user) {
      if (!user) {
        pendingSaveRef.current = null;
        lastBookIdRef.current = null;
        clearLocalChangesDirty();
      }
      return;
    }

    // Локальний стан змінився — з цієї миті дані в хмарі застарілі.
    // Прапорець скидається лише після завершення запису (див. saveToCloud).
    const localChangeVersion = markLocalChangesDirty();

    // Книга змінилася — негайно зберігаємо ще не збережені зміни в ПОПЕРЕДНЮ книгу.
    // Інакше cleanup нижче скасував би таймер, а наступний запис пішов би вже в нову книгу.
    if (lastBookIdRef.current !== null && lastBookIdRef.current !== currentBookId && pendingSaveRef.current) {
      const flushPendingSave = pendingSaveRef.current;
      pendingSaveRef.current = null;
      console.warn('💾 Перемикання книги: зберігаємо незавершені зміни в попередню книгу.');
      flushPendingSave();
    }
    lastBookIdRef.current = currentBookId;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSyncStatus(getSyncStatusText('syncing'));
    const saveToCloud = async () => {
      // 🔒 FETCH-FIRST: Якщо дані ще не завантажені з хмари — НІЧОГО НЕ ПИШЕМО!
      if (!isDataLoaded) {
        console.warn('⛔ Блокування запису: Дані з Firestore ще не завантажені. Очікуємо завершення завантаження...');
        setSyncStatus(getSyncStatusText('local'));
        clearLocalChangesDirty(localChangeVersion);
        return;
      }
      
      // 🔒 ЗАПОБІЖНИК ЗАПИСУ: Якщо в хмарі дані зашифровані, але у нас немає пароля — НІЧОГО НЕ ПИШЕМО!
      if (isRemoteDataEncrypted && !encryptionPassword) {
        console.warn('⛔ Блокування запису: Спроба перезаписати зашифровані дані без пароля!');
        setSyncStatus(getSyncStatusText('local'));
        clearLocalChangesDirty(localChangeVersion);
        return;
      }

      if (firestoreBudgetContext?.isReadOnly) {
        console.warn('⛔ Блокування запису: активна книга бюджету лише для читання.');
        setSyncStatus(getSyncStatusText('local'));
        clearLocalChangesDirty(localChangeVersion);
        return;
      }
      // ВАЖЛИВО: Використовуємо budgets, які вже містять правильні startBalances
      // Не використовуємо хардкодні значення startBalanceUAH/USD/EUR
      // ВАЖЛИВО: Якщо budgets порожній, це означає, що дані ще не завантажені з БД,
      // тому не зберігаємо, щоб уникнути перезапису даних з БД локальними даними
      if (!budgets || Object.keys(budgets).length === 0) {
        console.log('⚠️ useSyncDebounce: budgets порожній, пропускаємо збереження');
        setSyncStatus(getSyncStatusText('local'));
        clearLocalChangesDirty(localChangeVersion);
        return;
      }
      
      const currentId = activeBudgetId || 'default';
      const currentBudget = budgets[currentId];
      
      // ВАЖЛИВО: Перевіряємо, чи активний бюджет існує і містить дані
      // Якщо ні, не зберігаємо, щоб уникнути перезапису даних з БД
      if (!currentBudget) {
        console.log('⚠️ useSyncDebounce: активний бюджет не знайдено, пропускаємо збереження');
        setSyncStatus(getSyncStatusText('local'));
        clearLocalChangesDirty(localChangeVersion);
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
      
      try {
        await saveToFirestore(
          user,
          budgetsToSave,
          currentId,
          false,
          setSyncStatus,
          getSyncStatusText,
          encryptionPassword,
          setIsEncrypted,
          firestoreBudgetContext || undefined
        );
      } finally {
        // Запис завершився (успішно або з помилкою) — тепер серверні снапшоти
        // знову можна застосовувати, вони вже не старіші за локальний стан.
        clearLocalChangesDirty(localChangeVersion);
      }
    };

    pendingSaveRef.current = saveToCloud;
    saveTimeoutRef.current = setTimeout(() => {
      pendingSaveRef.current = null;
      void saveToCloud();
    }, 600);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, latestDataRef, setSyncStatus, getSyncStatusText, encryptionPassword, setIsEncrypted, isRemoteDataEncrypted, isDataLoaded, firestoreBudgetContext]);

  return saveTimeoutRef;
}

