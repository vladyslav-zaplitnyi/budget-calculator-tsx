import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
export const SECONDARY_BUDGET_BOOK_ID = 'secondary';
/** Free product cap: a user may keep at most two budget books (e.g. Personal + Family). */
export const MAX_USER_BUDGET_BOOKS = 2;

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

/** Deterministic JSON with sorted keys, so two equal payloads always produce the same string. */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

/**
 * Signature of the fields that define a book's budget content.
 * `updatedAt` / `displayLabel` / `isReadOnly` are intentionally ignored: they change
 * without the budget content changing (metadata-only writes).
 */
const buildBookSignature = (raw: Record<string, unknown> | null | undefined): string => {
  if (!raw) return '';
  const isEncrypted = raw.isEncrypted === true;
  return stableStringify({
    isEncrypted,
    encryptedData: isEncrypted ? raw.encryptedData ?? null : null,
    activeBudgetId: isEncrypted ? null : raw.activeBudgetId ?? null,
    budgets: isEncrypted ? null : raw.budgets ?? null
  });
};

/**
 * Signatures of the book payloads already present locally (loaded or just written).
 * Used to (a) skip no-op writes and (b) ignore the realtime echo of our own saves.
 */
const knownBookSignatures = new Map<string, string>();
const bookSignatureKey = (uid: string, bookId: string) => `${uid}:${bookId}`;

const rememberBookSignature = (
  uid: string,
  bookId: string,
  raw: Record<string, unknown> | null | undefined
): void => {
  if (!raw) return;
  knownBookSignatures.set(bookSignatureKey(uid, bookId), buildBookSignature(raw));
};

const isKnownBookSignature = (uid: string, bookId: string, raw: Record<string, unknown>): boolean =>
  knownBookSignatures.get(bookSignatureKey(uid, bookId)) === buildBookSignature(raw);

const sanitizeExchangeRatesForFirestore = (rates: Budget['exchangeRates'] | undefined): Budget['exchangeRates'] => {
  const out: Budget['exchangeRates'] = {};
  if (!rates || typeof rates !== 'object') return out;

  Object.entries(rates).forEach(([key, value]) => {
    if (typeof value === 'number') {
      if (Number.isFinite(value) && value > 0) {
        out[key] = value;
      }
      return;
    }

    if (value && typeof value === 'object') {
      const buy = (value as { buy?: unknown }).buy;
      const sell = (value as { sell?: unknown }).sell;
      if (
        typeof buy === 'number' &&
        typeof sell === 'number' &&
        Number.isFinite(buy) &&
        Number.isFinite(sell) &&
        buy > 0 &&
        sell > 0
      ) {
        out[key] = { buy, sell };
      }
    }
  });

  return out;
};

const sanitizeBudgetsForFirestore = (input: Budgets): Budgets => {
  const sanitized: Budgets = {};
  Object.entries(input || {}).forEach(([id, budget]) => {
    if (!budget) return;
    sanitized[id] = {
      ...budget,
      exchangeRates: sanitizeExchangeRatesForFirestore(budget.exchangeRates)
    };
  });
  return deepSanitizeUndefined(sanitized);
};

const knownContentSignatures = new Map<string, string>();

const buildContentSignature = (activeBudgetId: string, budgets: Budgets): string =>
  stableStringify({
    activeBudgetId,
    budgets: sanitizeBudgetsForFirestore(budgets)
  });

const rememberContentSignature = (
  uid: string,
  bookId: string,
  activeBudgetId: string,
  budgets: Budgets
): void => {
  knownContentSignatures.set(
    bookSignatureKey(uid, bookId),
    buildContentSignature(activeBudgetId, budgets)
  );
};

const isKnownContentSignature = (
  uid: string,
  bookId: string,
  activeBudgetId: string,
  budgets: Budgets
): boolean =>
  knownContentSignatures.get(bookSignatureKey(uid, bookId)) ===
  buildContentSignature(activeBudgetId, budgets);

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

/**
 * Ensures Auth has a matching Firestore user document.
 * Google Auth creates only the Authentication account; Firestore documents must be created by the app.
 */
export async function ensureUserDocument(user: User): Promise<void> {
  const uRef = userDocRef(user.uid);
  const snap = await getDoc(uRef);
  await setDoc(
    uRef,
    {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      dataLayoutVersion: USER_DATA_LAYOUT_VERSION,
      currentBudgetBookId: DEFAULT_BUDGET_BOOK_ID,
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

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

const parseBudgetBookDocument = async (
  bookId: string,
  raw: Record<string, unknown>,
  encryptionPassword: string | null | undefined
): Promise<LoadedUserData | 'needsPassword'> => {
  if (raw.isEncrypted === true && raw.encryptedData) {
    if (!encryptionPassword) return 'needsPassword';
    try {
      const decrypted = await decryptData<{ activeBudgetId: string; budgets: Budgets }>(
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
          const decrypted = await decryptData<{ activeBudgetId: string; budgets: Budgets }>(
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
    const parsed = await parseBudgetBookDocument(currentBudgetBookId, bookRaw, encryptionPassword);
    if (parsed === 'needsPassword') {
      return { kind: 'needsPassword' };
    }

    if (!parsed.budgets || Object.keys(parsed.budgets).length === 0) {
      return null;
    }

    const currentBudgetBookIsReadOnly = bookRaw.isReadOnly === true;

    // Запам'ятовуємо вміст, який вже застосовано локально, щоб realtime-підписка
    // не перезастосовувала той самий документ одразу після підключення.
    rememberBookSignature(user.uid, currentBudgetBookId, bookRaw);
    rememberContentSignature(
      user.uid,
      currentBudgetBookId,
      parsed.activeBudgetId || DEFAULT_BUDGET_BOOK_ID,
      parsed.budgets
    );

    return {
      kind: 'data',
      data: parsed,
      budgetBooks,
      currentBudgetBookId,
      currentBudgetBookIsReadOnly
    };
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'budgetBooksFirestore', action: 'loadUserBudgetFirestoreState' }
    );
    // ВАЖЛИВО: помилку читання не перетворюємо на null.
    // null — це сигнал "у користувача немає даних", і виклик після нього
    // створює порожню книгу в Firestore (втрата даних при мережевій помилці).
    throw error;
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
  const parsed = await parseBudgetBookDocument(bookId, raw, encryptionPassword);
  if (parsed === 'needsPassword') return 'needsPassword';
  if (!parsed.budgets || Object.keys(parsed.budgets).length === 0) return null;
  rememberBookSignature(user.uid, bookId, raw);
  rememberContentSignature(
    user.uid,
    bookId,
    parsed.activeBudgetId || DEFAULT_BUDGET_BOOK_ID,
    parsed.budgets
  );
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

  const budgetsForFirestore = sanitizeBudgetsForFirestore(budgets);

  try {
    validateBudgets(budgetsForFirestore);
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
  const existingSameEncryption = existing
    ? (existing.isEncrypted === true) === Boolean(encryptionPassword)
    : false;

  // No-op guard по розшифрованому вмісту: зупиняє зайве шифрування та пінг-понг між пристроями.
  if (
    existing &&
    existingSameEncryption &&
    isKnownContentSignature(user.uid, budgetBookId, safeActive, budgetsForFirestore)
  ) {
    rememberBookSignature(user.uid, budgetBookId, existing);
    return;
  }

  const payload: Record<string, unknown> = encryptionPassword
    ? {
        isReadOnly: isReadOnlyPersisted,
        isEncrypted: true,
        encryptedData: await encryptData(
          { activeBudgetId: safeActive, budgets: budgetsForFirestore },
          encryptionPassword
        ),
        displayLabel,
        updatedAt: serverTimestamp()
      }
    : {
        isReadOnly: isReadOnlyPersisted,
        isEncrypted: false,
        activeBudgetId: safeActive,
        budgets: budgetsForFirestore,
        displayLabel,
        updatedAt: serverTimestamp()
      };

  if (existing && buildBookSignature(existing) === buildBookSignature(payload)) {
    rememberBookSignature(user.uid, budgetBookId, existing);
    rememberContentSignature(user.uid, budgetBookId, safeActive, budgetsForFirestore);
    return;
  }

  // Запам'ятовуємо ДО setDoc, щоб локальний onSnapshot не встиг спрацювати раніше за запис у Map.
  const sigKey = bookSignatureKey(user.uid, budgetBookId);
  const prevBookSig = knownBookSignatures.get(sigKey);
  const prevContentSig = knownContentSignatures.get(sigKey);
  rememberBookSignature(user.uid, budgetBookId, payload);
  rememberContentSignature(user.uid, budgetBookId, safeActive, budgetsForFirestore);

  try {
    await setDoc(bRef, payload);
  } catch (err) {
    if (prevBookSig !== undefined) knownBookSignatures.set(sigKey, prevBookSig);
    else knownBookSignatures.delete(sigKey);
    if (prevContentSig !== undefined) knownContentSignatures.set(sigKey, prevContentSig);
    else knownContentSignatures.delete(sigKey);
    throw err;
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

/** Lists the user's budget books (sorted, capped at MAX_USER_BUDGET_BOOKS). */
export async function listBudgetBookSummaries(user: User): Promise<BudgetBookSummary[]> {
  const snap = await getDocs(collection(db, 'users', user.uid, BUDGET_BOOKS_SUBCOLLECTION));
  const summaries = snap.docs.map((d) =>
    mapBookDocToSummary(d.id, d.data() as Record<string, unknown>)
  );
  summaries.sort((a, b) => {
    // Keep the primary "default" book first, then alphabetical.
    if (a.id === DEFAULT_BUDGET_BOOK_ID) return -1;
    if (b.id === DEFAULT_BUDGET_BOOK_ID) return 1;
    return a.id.localeCompare(b.id);
  });
  return summaries.slice(0, MAX_USER_BUDGET_BOOKS);
}

/** Builds a stable, unique book id from a human label. */
const buildBookId = (label: string, existingIds: string[]): string => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || SECONDARY_BUDGET_BOOK_ID;
  if (!existingIds.includes(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (existingIds.includes(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
};

/**
 * Creates a new budget book document for the user, enforcing MAX_USER_BUDGET_BOOKS.
 * `initialBudgets` should contain a single `default` budget (built by the caller).
 * Returns the new book id, or throws if the cap is reached.
 */
export async function createBudgetBook(
  user: User,
  displayLabel: string,
  initialBudgets: Budgets,
  encryptionPassword?: string | null
): Promise<string> {
  const existing = await listBudgetBookSummaries(user);
  if (existing.length >= MAX_USER_BUDGET_BOOKS) {
    throw new Error('MAX_BUDGET_BOOKS_REACHED');
  }
  const label = (displayLabel || '').trim() || SECONDARY_BUDGET_BOOK_ID;
  const newId = buildBookId(
    label,
    existing.map((b) => b.id)
  );

  // Stamp the provided label onto the single budget so deriveDisplayLabel resolves to it.
  const budgetsToSave: Budgets = {};
  Object.entries(initialBudgets).forEach(([id, b]) => {
    budgetsToSave[id] = { ...b, name: label };
  });

  await saveBudgetBookToFirestore({
    user,
    budgetBookId: newId,
    budgets: budgetsToSave,
    activeBudgetId: DEFAULT_BUDGET_BOOK_ID,
    encryptionPassword: encryptionPassword ?? null,
    clientClaimsWritable: true
  });

  return newId;
}

/** Renames a budget book (updates the displayLabel field). */
export async function renameBudgetBook(
  user: User,
  bookId: string,
  displayLabel: string
): Promise<void> {
  const label = (displayLabel || '').trim();
  if (!label) return;
  await setDoc(
    budgetBookRef(user.uid, bookId),
    {
      displayLabel: label,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

/**
 * Realtime subscription to a single budget book document.
 *
 * Fires only for changes made elsewhere (another device/tab): the echo of our own
 * writes is recognised by its payload signature and skipped, which prevents a
 * write → snapshot → write loop.
 *
 * Encrypted books are decrypted with the current password; when the password is
 * missing the snapshot is ignored and the existing password-modal flow stays in charge.
 */
export function subscribeBudgetBookDocument(
  user: User,
  bookId: string,
  encryptionPassword: string | null | undefined,
  onData: (data: LoadedUserData) => void,
  /**
   * Повертає true, коли локальні зміни ще не підтверджені Firestore.
   * У цей момент серверний снапшот застарілий і не повинен затирати локальні дані.
   */
  shouldIgnoreSnapshot?: () => boolean
): () => void {
  let cancelled = false;
  let processing = false;
  // Останній снапшот, що надійшов під час обробки попереднього (швидкі послідовні зміни).
  let pendingRaw: Record<string, unknown> | null = null;

  const handleRaw = (raw: Record<string, unknown>) => {
    if (cancelled) return;
    if (isKnownBookSignature(user.uid, bookId, raw)) {
      // Власний запис (або документ, який уже застосовано) — нічого не робимо.
      return;
    }
    if (raw.isEncrypted === true && !encryptionPassword) return;

    if (processing) {
      pendingRaw = raw;
      return;
    }
    processing = true;

    parseBudgetBookDocument(bookId, raw, encryptionPassword ?? null)
      .then((parsed) => {
        if (cancelled || parsed === 'needsPassword') return;
        // Повторна перевірка після async decryptData: за цей час локальний стан міг змінитися.
        if (shouldIgnoreSnapshot?.()) return;

        const parsedActiveId = parsed.activeBudgetId || DEFAULT_BUDGET_BOOK_ID;
        if (parsed.budgets && isKnownContentSignature(user.uid, bookId, parsedActiveId, parsed.budgets)) {
          rememberBookSignature(user.uid, bookId, raw);
          return;
        }

        rememberBookSignature(user.uid, bookId, raw);
        if (parsed.budgets) {
          rememberContentSignature(user.uid, bookId, parsedActiveId, parsed.budgets);
        }
        onData(parsed);
      })
      .catch((error) => {
        console.error('Помилка обробки realtime-оновлення бюджету:', error);
      })
      .finally(() => {
        processing = false;
        if (!cancelled && pendingRaw) {
          const next = pendingRaw;
          pendingRaw = null;
          handleRaw(next);
        }
      });
  };

  const unsubscribe = onSnapshot(
    budgetBookRef(user.uid, bookId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (cancelled) return;

      // Локальні зміни ще не збережені (debounce або запис у процесі) —
      // снапшот із сервера старіший за локальний стан і затер би їх.
      if (shouldIgnoreSnapshot?.()) return;

      // Тільки підтверджені сервером зміни: локальний (optimistic) запис цього ж
      // клієнта і кеш без мережі не є оновленням з іншого пристрою.
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) return;

      handleRaw(snapshot.data() as Record<string, unknown>);
    },
    (error) => {
      if (cancelled) return;
      console.warn('⚠️ Realtime-підписка на книгу бюджету недоступна:', error);
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

/** Deletes a budget book. The primary `default` book cannot be deleted. */
export async function deleteBudgetBook(user: User, bookId: string): Promise<void> {
  if (bookId === DEFAULT_BUDGET_BOOK_ID) {
    throw new Error('CANNOT_DELETE_DEFAULT_BOOK');
  }
  const batch = writeBatch(db);
  batch.delete(budgetBookRef(user.uid, bookId));
  batch.set(
    userDocRef(user.uid),
    {
      currentBudgetBookId: DEFAULT_BUDGET_BOOK_ID,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();
}
