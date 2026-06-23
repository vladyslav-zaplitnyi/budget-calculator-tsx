import { User } from 'firebase/auth';
import { Budgets, UserData, LoadedUserData, BudgetBookSummary } from '../types';
import { handleError } from './errorHandler';
import { WrongPasswordError } from './encryption';
import { createEmptyMonthDays } from './dayHelpers';
import { DEFAULT_CURRENCIES } from './currencies';
import { translate } from '../i18n/config';
import {
  loadUserBudgetFirestoreState,
  saveBudgetBookToFirestore,
  ReadOnlyBudgetBookError,
  DEFAULT_BUDGET_BOOK_ID
} from '../services/budgetBooksFirestore';
import {
  applyRollingBootToAllBudgets,
  migrateBudgetToMonthsByKey,
  trimMonthsOnBudget
} from './rollingMonthsBudget';

export { ReadOnlyBudgetBookError };

/** Cloud save target: one document under `users/{uid}/budgetBooks/{budgetBookId}`. */
export interface FirestoreBudgetContext {
  budgetBookId: string;
  isReadOnly: boolean;
}

/** Result of loading signed-in user data from Firestore (multi-book layout). */
export interface LoadedFirestoreBundle extends LoadedUserData {
  budgetBooks: BudgetBookSummary[];
  currentBudgetBookId: string;
  currentBudgetBookIsReadOnly: boolean;
}

export type LoadFromFirestoreResult =
  | LoadedFirestoreBundle
  | { isEncrypted: true; needsPassword: true }
  | null;

const getCurrentBudgetDate = (): { year: number; month: number } => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
};

// Функція для створення пустого дефолтного бюджету (як після "стерти всі поля")
export const createEmptyDefaultBudget = (): Budgets => {
  const emptyStartBalances: Record<string, number | null> = {};
  DEFAULT_CURRENCIES.forEach(currencyCode => {
    emptyStartBalances[currencyCode] = null;
  });
  
  // Ініціалізуємо дату бюджету поточною датою
  const now = new Date();
  const budgetDate = {
    year: now.getFullYear(),
    month: now.getMonth()
  };
  
  const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
  const monthKey = `${budgetDate.year}-${String(budgetDate.month + 1).padStart(2, '0')}`;
  const sliceBalances: Record<string, number | null> = {};
  DEFAULT_CURRENCIES.forEach((currencyCode) => {
    sliceBalances[currencyCode] = null;
  });

  return {
    'default': {
      name: translate('budget.defaultBudgetName'),
      startBalances: emptyStartBalances,
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: emptyDays,
      displayCurrency: 'RON',
      displayCurrencyIndex: 0,
      budgetDate,
      monthsByKey: {
        [monthKey]: {
          days: emptyDays,
          startBalances: { ...sliceBalances }
        }
      }
    }
  };
};

// Функція для завантаження даних з localStorage
export const loadFromLocalStorage = (): LoadedUserData | null => {
  try {
    const saved = localStorage.getItem('budgetTrackerData');
    if (!saved) return null;
    
    const parsedData: UserData = JSON.parse(saved);

    // Перевіряємо, чи є нова структура
    if (parsedData.budgets && Object.keys(parsedData.budgets).length > 0) {
      const activeId = parsedData.activeBudgetId || 'default';
      const migratedBudgets: Budgets = {};
      Object.keys(parsedData.budgets).forEach((bid) => {
        const b = parsedData.budgets[bid];
        if (b) migratedBudgets[bid] = trimMonthsOnBudget(migrateBudgetToMonthsByKey(b));
      });
      const rolled = applyRollingBootToAllBudgets(migratedBudgets, activeId);

      let activeBudget = rolled[activeId];

      if (!activeBudget) {
        const budgetKeys = Object.keys(rolled);
        if (budgetKeys.length > 0) {
          const firstKey = budgetKeys[0];
          activeBudget = rolled[firstKey];
          console.log(`⚠️ Активний бюджет ${activeId} не знайдено, використовуємо ${firstKey}`);
        }
      }

      if (activeBudget) {
        const resolvedActiveId = rolled[activeId] ? activeId : Object.keys(rolled)[0] || 'default';
        const finalActive = rolled[resolvedActiveId];
        if (!finalActive) return null;

        if (finalActive.displayCurrency) {
          try {
            localStorage.setItem('displayCurrency', finalActive.displayCurrency);
          } catch (error) {
            console.error('Помилка при збереженні displayCurrency в localStorage:', error);
          }
        }
        if (finalActive.displayCurrencyIndex !== undefined) {
          try {
            localStorage.setItem('displayCurrencyIndex', finalActive.displayCurrencyIndex.toString());
          } catch (error) {
            console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
          }
        }

        return {
          ...parsedData,
          budgets: rolled,
          activeBudgetId: resolvedActiveId,
          days: finalActive.days || [],
          selectedCurrencies: finalActive.selectedCurrencies || ['UAH', 'USD', 'EUR'],
          exchangeRates: finalActive.exchangeRates || {},
          budgetDate: finalActive.budgetDate
        };
      }
    }

    // Якщо структура не валідна, повертаємо null
    return null;
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromLocalStorage' }
    );
  }
  return null;
};

// Функція для збереження даних в localStorage
export const saveToLocalStorage = (
  budgets?: Budgets,
  activeBudgetId?: string
): void => {
  try {
    const raw = budgets || {};
    const trimmed: Budgets = {};
    Object.keys(raw).forEach((id) => {
      const b = raw[id];
      if (b) trimmed[id] = trimMonthsOnBudget(b);
    });
    const data: UserData = {
      activeBudgetId: activeBudgetId || 'default',
      budgets: trimmed,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem('budgetTrackerData', JSON.stringify(data));
  } catch (error) {
    console.error('Помилка при збереженні в localStorage:', error);
  }
};

// Функція для збереження multi-budget даних у Firestore (`users/{uid}/budgetBooks/{bookId}`).
// replaceBudgets залишено для зворотної сумісності сигнатури; запис завжди передає повний об'єкт budgets.
export const saveToFirestore = async (
  user: User | null,
  budgetsToSave: Budgets,
  activeId: string,
  _replaceBudgets: boolean = false,
  setSyncStatus?: (status: string) => void,
  getSyncStatusText?: (key: string) => string,
  encryptionPassword?: string | null,
  setIsEncrypted?: (encrypted: boolean) => void,
  budgetContext?: FirestoreBudgetContext | null
): Promise<void> => {
  if (!user) return;

  try {
    const trimmedSave: Budgets = {};
    Object.entries(budgetsToSave).forEach(([id, b]) => {
      if (b) trimmedSave[id] = trimMonthsOnBudget(b);
    });

    const fallbackBudgetDate = getCurrentBudgetDate();
    Object.values(trimmedSave).forEach((budget) => {
      if (budget && budget.budgetDate == null) {
        budget.budgetDate = fallbackBudgetDate;
      }
    });

    const ctx: FirestoreBudgetContext = budgetContext ?? {
      budgetBookId: DEFAULT_BUDGET_BOOK_ID,
      isReadOnly: false
    };

    if (ctx.isReadOnly) {
      throw new ReadOnlyBudgetBookError();
    }

    await saveBudgetBookToFirestore({
      user,
      budgetBookId: ctx.budgetBookId,
      budgets: trimmedSave,
      activeBudgetId: activeId,
      encryptionPassword: encryptionPassword ?? null,
      clientClaimsWritable: !ctx.isReadOnly
    });

    if (setIsEncrypted) {
      setIsEncrypted(!!encryptionPassword);
    }

    if (setSyncStatus && getSyncStatusText) {
      setSyncStatus(getSyncStatusText('saved'));
    }
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'saveToFirestore' }
    );
    if (setSyncStatus && getSyncStatusText) {
      setSyncStatus(getSyncStatusText('error'));
    }
  }
};

export const loadFromFirestore = async (
  user: User | null,
  encryptionPassword?: string | null
): Promise<LoadFromFirestoreResult> => {
  if (!user) return null;

  try {
    const res = await loadUserBudgetFirestoreState(user, encryptionPassword);
    if (!res) return null;
    if (res.kind === 'needsPassword') {
      return { isEncrypted: true, needsPassword: true };
    }
    const { data, budgetBooks, currentBudgetBookId, currentBudgetBookIsReadOnly } = res;
    if (!data.budgets || Object.keys(data.budgets).length === 0) {
      return null;
    }
    return {
      ...data,
      budgetBooks,
      currentBudgetBookId,
      currentBudgetBookIsReadOnly
    };
  } catch (error) {
    if (error instanceof WrongPasswordError) {
      throw error;
    }
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromFirestore' }
    );
  }
  return null;
};
