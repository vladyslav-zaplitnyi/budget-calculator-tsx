import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type UpdateData,
  type DocumentData
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { Budget, BudgetBookSummary, Budgets, LoadedUserData } from '../types';
import { validateBudgets } from '../schemas/budgetSchema';
import { encryptData, decryptData, WrongPasswordError } from '../utils/encryption';
import { handleError } from '../utils/errorHandler';
import { getCookie } from '../utils/cookieHelpers';
import { ACTIVE_BUDGET_BOOK_COOKIE_KEY } from '../utils/constants';

export const BUDGET_BOOKS_SUBCOLLECTION = 'budgetBooks';
export const USER_DATA_LAYOUT_VERSION = 2;
export const DEFAULT_BUDGET_BOOK_ID = 'default';
export const MAX_USER_BUDGET_BOOKS = 3;

export class ReadOnlyBudgetBookError extends Error {
  constructor() {
    super('READ_ONLY_BUDGET_BOOK');
    this.name = 'ReadOnlyBudgetBookError';
  }
}

const convertTimestampToString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
};

export const deepSanitizeUndefined = <T,>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

const syncDisplayCurrencyToLocalStorage = (activeBudget: Budget | undefined) => {
  if (activeBudget?.displayCurrency) {
    try {
      localStorage.setItem('displayCurrency', activeBudget.displayCurrency);
    } catch (error) {
      console.error('Помилка при збереженні displayCurrency в localStorage:', error);
    }
  } else {
    try {
      localStorage.setItem('displayCurrency', 'RON');
    } catch (error) {
      console.error('Помилка при збереженні displayCurrency в localStorage:', error);
    }
  }
  if (activeBudget?.displayCurrencyIndex !== undefined) {
    try {
      localStorage.setItem('displayCurrencyIndex', activeBudget.displayCurrencyIndex.toString());
    } catch (error) {
      console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
    }
  } else {
    try {
      localStorage.setItem('displayCurrencyIndex', '0');
    } catch (error) {
      console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
    }
  }
};

const resolveActiveBudgetId = (budgets: Budgets, preferred?: string | null): string => {
  if (preferred && budgets[preferred]) return preferred;
  const keys = Object.keys(budgets);
  return keys[0] || DEFAULT_BUDGET_BOOK_ID;
};

const buildLoadedUserData = (
  budgets: Budgets,
  activeId: string,
  updatedAt?: string,
  savedAt?: string,
  isEncrypted?: boolean
): LoadedUserData => {
  const safeId = resolveActiveBudgetId(budgets, activeId);
  const activeBudget = budgets[safeId];
  syncDisplayCurrencyToLocalStorage(activeBudget);
  return {
    activeBudgetId: safeId,
    budgets,
    savedAt,
    updatedAt,
    isEncrypted,
    days: activeBudget?.days || [],
    selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
    exchangeRates: activeBudget?.exchangeRates || {},
    budgetDate: activeBudget?.budgetDate
  };
};

const deriveDisplayLabel = (budgets: Budgets, activeBudgetId: string): string => {
  const id = resolveActiveBudgetId(budgets, activeBudgetId);
  const b = budgets[id];
  return (b?.name && b.name.trim()) || id;
};

const userDocRef = (uid: string) => doc(db, 'users', uid);
const budgetBookRef = (uid: string, bookId: string) =>
  doc(db, 'users', uid, BUDGET_BOOKS_SUBCOLLECTION, bookId);

export type LoadUserBudgetFirestoreResult =
  | { kind: 'needsPassword' }
  | {
      kind: 'data';
      data: LoadedUserData;
      budgetBooks: BudgetBookSummary[];
      currentBudgetBookId: string;
      currentBudgetBookIsReadOnly: boolean;
    }
  | null;

const hasLegacyUserRootPayload = (raw: Record<string, unknown>): boolean => {
  if (raw.isEncrypted === true && raw.encryptedData) return true;
  if (raw.budgets && typeof raw.budgets === 'object' && Object.keys(raw.budgets as object).length > 0) {
    return true;
  }
  return false;
};

const migrateLegacyToBudgetBooks = async (
  user: User,
  rawUser: Record<string, unknown>,
  decrypted?: { activeBudgetId: string; budgets: Budgets } | null
): Promise<void> => {
  let activeBudgetId = DEFAULT_BUDGET_BOOK_ID;
  let budgets: Budgets = {};

  if (decrypted) {
    budgets = decrypted.budgets || {};
    activeBudgetId = resolveActiveBudgetId(budgets, decrypted.activeBudgetId);
  } else if (rawUser.budgets && typeof rawUser.budgets === 'object') {
    budgets = rawUser.budgets as Budgets;
    activeBudgetId = resolveActiveBudgetId(budgets, rawUser.activeBudgetId as string | undefined);
  } else {
    return;
  }

  const batch = writeBatch(db);
  const bRef = budgetBookRef(user.uid, DEFAULT_BUDGET_BOOK_ID);
  const displayLabel = deriveDisplayLabel(budgets, activeBudgetId);

  batch.set(
    bRef,
    {
      isReadOnly: false,
      isEncrypted: false,
      activeBudgetId,
      budgets: deepSanitizeUndefined(budgets),
      displayLabel,
      updatedAt: serverTimestamp()
    },
    { merge: false }
  );

  const uRef = userDocRef(user.uid);
  const patch: Record<string, unknown> = {
    dataLayoutVersion: USER_DATA_LAYOUT_VERSION,
    currentBudgetBookId: DEFAULT_BUDGET_BOOK_ID,
    updatedAt: serverTimestamp(),
    budgets: deleteField(),
    activeBudgetId: deleteField(),
    isEncrypted: false,
    encryptedData: deleteField()
  };

  batch.update(uRef, patch as UpdateData<DocumentData>);
  await batch.commit();
};

const mapBookDocToSummary = (id: string, data: Record<string, unknown>): BudgetBookSummary => {
  const isReadOnly = data.isReadOnly === true;
  const label =
    (typeof data.displayLabel === 'string' && data.displayLabel.trim()) ||
    (typeof data.displayName === 'string' && data.displayName.trim()) ||
    id;
  return { id, isReadOnly, displayLabel: label };
};

const parseBudgetBookDocument = (
  bookId: string,
  raw: Record<string, unknown>,
  encryptionPassword: string | null | undefined
): (LoadedUserData | 'needsPassword') => {
  if (raw.isEncrypted === true && raw.encryptedData) {
    if (!encryptionPassword) return 'needsPassword';
    try {
      const decrypted = decryptData<{ activeBudgetId: string; budgets: Budgets }>(
        raw.encryptedData as string,
        encryptionPassword
      );
      const budgets = decrypted.budgets || {};
      const activeId = resolveActiveBudgetId(budgets, decrypted.activeBudgetId);
      return buildLoadedUserData(budgets, activeId, convertTimestampToString(raw.updatedAt), undefined, true);
    } catch (e) {
      if (e instanceof WrongPasswordError) throw e;
      throw e;
    }
  }

  if (raw.budgets && typeof raw.budgets === 'object' && Object.keys(raw.budgets as object).length > 0) {
    const budgets = raw.budgets as Budgets;
    const activeId = resolveActiveBudgetId(budgets, raw.activeBudgetId as string | undefined);
    return buildLoadedUserData(
      budgets,
      activeId,
      convertTimestampToString(raw.updatedAt),
      undefined,
      raw.isEncrypted === true
    );
  }

  return buildLoadedUserData({} as Budgets, DEFAULT_BUDGET_BOOK_ID, convertTimestampToString(raw.updatedAt));
};

/**
 * Loads the authenticated user's budget state using `users/{uid}/budgetBooks/*`.
 * Migrates legacy `users/{uid}` root `budgets` / `encryptedData` into `budgetBooks/default` once.
 */
export async function loadUserBudgetFirestoreState(
  user: User,
  encryptionPassword?: string | null
): Promise<LoadUserBudgetFirestoreResult> {
  try {
    const uRef = userDocRef(user.uid);
    const userSnap = await getDoc(uRef);
    let booksSnap = await getDocs(collection(db, 'users', user.uid, BUDGET_BOOKS_SUBCOLLECTION));

    if (!userSnap.exists() && booksSnap.empty) {
      return null;
    }

    const rawUser = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};

    if (booksSnap.empty && userSnap.exists() && hasLegacyUserRootPayload(rawUser)) {
      if (rawUser.isEncrypted === true && rawUser.encryptedData) {
        if (!encryptionPassword) {
          return { kind: 'needsPassword' };
        }
        try {
          const decrypted = decryptData<{ activeBudgetId: string; budgets: Budgets }>(
            rawUser.encryptedData as string,
            encryptionPassword
          );
          await migrateLegacyToBudgetBooks(user, rawUser, decrypted);
        } catch (e) {
          if (e instanceof WrongPasswordError) throw e;
          throw e;
        }
      } else {
        await migrateLegacyToBudgetBooks(user, rawUser, null);
      }
      booksSnap = await getDocs(collection(db, 'users', user.uid, BUDGET_BOOKS_SUBCOLLECTION));
    }

    if (booksSnap.empty) {
      return null;
    }

    const summariesUnsorted: BudgetBookSummary[] = booksSnap.docs.map((d) =>
      mapBookDocToSummary(d.id, d.data() as Record<string, unknown>)
    );
    summariesUnsorted.sort((a, b) => a.id.localeCompare(b.id));
    const budgetBooks = summariesUnsorted.slice(0, MAX_USER_BUDGET_BOOKS);

    const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
    let currentBudgetBookId: string | null =
      typeof userData.currentBudgetBookId === 'string' &&
      budgetBooks.some((b) => b.id === userData.currentBudgetBookId)
        ? (userData.currentBudgetBookId as string)
        : null;

    if (!currentBudgetBookId) {
      try {
        const cookieBook = getCookie(ACTIVE_BUDGET_BOOK_COOKIE_KEY);
        if (cookieBook && budgetBooks.some((b) => b.id === cookieBook)) {
          currentBudgetBookId = cookieBook;
        }
      } catch {
        // ignore cookie errors
      }
    }

    if (!currentBudgetBookId) {
      currentBudgetBookId = budgetBooks[0]?.id || DEFAULT_BUDGET_BOOK_ID;
    }

    const bookSnap = await getDoc(budgetBookRef(user.uid, currentBudgetBookId));
    if (!bookSnap.exists()) {
      return null;
    }

    const bookRaw = bookSnap.data() as Record<string, unknown>;
    const parsed = parseBudgetBookDocument(currentBudgetBookId, bookRaw, encryptionPassword);
    if (parsed === 'needsPassword') {
      return { kind: 'needsPassword' };
    }

    if (!parsed.budgets || Object.keys(parsed.budgets).length === 0) {
      return null;
    }

    const currentBudgetBookIsReadOnly = bookRaw.isReadOnly === true;

    return {
      kind: 'data',
      data: parsed,
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
      { context: 'budgetBooksFirestore', action: 'loadUserBudgetFirestoreState' }
    );
    return null;
  }
}

export async function loadBudgetBookDocumentForUser(
  user: User,
  bookId: string,
  encryptionPassword?: string | null
): Promise<{ data: LoadedUserData; isReadOnly: boolean } | 'needsPassword' | null> {
  const bookSnap = await getDoc(budgetBookRef(user.uid, bookId));
  if (!bookSnap.exists()) return null;
  const raw = bookSnap.data() as Record<string, unknown>;
  const isReadOnly = raw.isReadOnly === true;
  const parsed = parseBudgetBookDocument(bookId, raw, encryptionPassword);
  if (parsed === 'needsPassword') return 'needsPassword';
  if (!parsed.budgets || Object.keys(parsed.budgets).length === 0) return null;
  return { data: parsed, isReadOnly };
}

export async function persistUserCurrentBudgetBookId(user: User, bookId: string): Promise<void> {
  await setDoc(
    userDocRef(user.uid),
    {
      currentBudgetBookId: bookId,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export interface SaveBudgetBookParams {
  user: User;
  budgetBookId: string;
  /** When true, skip server write (caller should not invoke; service still verifies server flag). */
  clientClaimsWritable?: boolean;
  budgets: Budgets;
  activeBudgetId: string;
  encryptionPassword?: string | null;
}

/**
 * Writes one budget book document. Verifies `isReadOnly` on the server document before mutating.
 */
export async function saveBudgetBookToFirestore(params: SaveBudgetBookParams): Promise<void> {
  const {
    user,
    budgetBookId,
    budgets,
    activeBudgetId,
    encryptionPassword,
    clientClaimsWritable = true
  } = params;

  if (!clientClaimsWritable) {
    throw new ReadOnlyBudgetBookError();
  }

  const bRef = budgetBookRef(user.uid, budgetBookId);
  const existingSnap = await getDoc(bRef);
  const existing = existingSnap.exists() ? (existingSnap.data() as Record<string, unknown>) : null;
  const serverReadOnly = existing?.isReadOnly === true;
  if (serverReadOnly) {
    throw new ReadOnlyBudgetBookError();
  }

  try {
    validateBudgets(deepSanitizeUndefined(budgets));
  } catch (validationError) {
    handleError(
      validationError instanceof Error ? validationError : new Error(String(validationError)),
      {
        context: 'budgetBooksFirestore',
        action: 'saveBudgetBookToFirestore',
        details: 'Дані бюджетів не пройшли валідацію перед збереженням'
      }
    );
    throw new Error('Дані бюджетів не валідні');
  }

  const safeActive = resolveActiveBudgetId(budgets, activeBudgetId);
  const activeBudget = budgets[safeActive];
  if (activeBudget) {
    try {
      const savedDisplayCurrency = localStorage.getItem('displayCurrency');
      if (savedDisplayCurrency && ['UAH', 'USD', 'EUR', 'PLN', 'RON', 'CZK'].includes(savedDisplayCurrency)) {
        activeBudget.displayCurrency = savedDisplayCurrency;
      } else if (!activeBudget.displayCurrency) {
        activeBudget.displayCurrency = 'RON';
      }
      const savedIndex = localStorage.getItem('displayCurrencyIndex');
      if (savedIndex !== null && ['0', '1', '2', '3', '4'].includes(savedIndex)) {
        activeBudget.displayCurrencyIndex = parseInt(savedIndex, 10);
      } else if (activeBudget.displayCurrencyIndex === undefined) {
        activeBudget.displayCurrencyIndex = 0;
      }
    } catch (error) {
      console.error('Помилка при оновленні displayCurrency в бюджеті:', error);
    }
  }

  const displayLabel = deriveDisplayLabel(budgets, safeActive);
  const isReadOnlyPersisted = existing?.isReadOnly === true ? true : false;

  if (encryptionPassword) {
    const sanitized = deepSanitizeUndefined(budgets);
    const encryptedData = encryptData({ activeBudgetId: safeActive, budgets: sanitized }, encryptionPassword);
    await setDoc(bRef, {
      isReadOnly: isReadOnlyPersisted,
      isEncrypted: true,
      encryptedData,
      displayLabel,
      budgets: deleteField(),
      activeBudgetId: deleteField(),
      updatedAt: serverTimestamp()
    });
  } else {
    await setDoc(bRef, {
      isReadOnly: isReadOnlyPersisted,
      isEncrypted: false,
      activeBudgetId: safeActive,
      budgets: deepSanitizeUndefined(budgets),
      displayLabel,
      encryptedData: deleteField(),
      updatedAt: serverTimestamp()
    });
  }

  await setDoc(
    userDocRef(user.uid),
    {
      dataLayoutVersion: USER_DATA_LAYOUT_VERSION,
      currentBudgetBookId: budgetBookId,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function deleteAllBudgetBooksForUser(userId: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', userId, BUDGET_BOOKS_SUBCOLLECTION));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.delete(d.ref);
  });
  if (!snap.empty) {
    await batch.commit();
  }
}
