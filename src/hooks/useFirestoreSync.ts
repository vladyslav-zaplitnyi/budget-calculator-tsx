import { useEffect, useState } from 'react';
import { loadFromFirestore, loadFromLocalStorage, saveToFirestore, createEmptyDefaultBudget, saveToLocalStorage, FirestoreBudgetContext } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES, BASE_CURRENCY } from '../utils/currencies';
import {
  ACTIVE_BUDGET_COOKIE_KEY,
  ACTIVE_BUDGET_BOOK_COOKIE_KEY,
  BUDGET_BOOK_CREATE_ENABLED
} from '../utils/constants';
import { getCookie, setCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates, Budget } from '../types';
import { getBuyRate, hasPairStructure } from '../utils/typeGuards';
import { WrongPasswordError, UnsupportedEncryptionFormatError } from '../utils/encryption';
import { translate } from '../i18n/config';
import { roundToDecimals } from '../utils/rounding';
import {
  loadBudgetBookDocumentForUser,
  persistUserCurrentBudgetBookId,
  listBudgetBookSummaries,
  createBudgetBook,
  renameBudgetBook,
  deleteBudgetBook,
  DEFAULT_BUDGET_BOOK_ID,
  MAX_USER_BUDGET_BOOKS
} from '../services/budgetBooksFirestore';
import { applyRollingBootToAllBudgets } from '../utils/rollingMonthsBudget';

/**
 * Hook для завантаження та синхронізації даних з Firestore
 * Обробляє завантаження даних при вході користувача та синхронізацію з localStorage
 * 
 * 🔒 WRITE GUARD (ЗАПОБІЖНИК ЗАПИСУ):
 * Цей хук реалізує захист від перезапису зашифрованих даних у Firestore.
 * 
 * ПРОБЛЕМА, ЯКУ ВИРІШУЄ:
 * 1. У Firestore зберігаються зашифровані дані (isEncrypted: true)
 * 2. Користувач заходить на сайт без пароля
 * 3. Локально дані порожні або дефолтні
 * 4. БЕЗ ЗАХИСТУ: Синхронізація перезаписує зашифровані дані порожніми → ВТРАТА ДАНИХ
 * 
 * РІШЕННЯ:
 * - Стан isRemoteDataEncrypted відстежує наявність зашифрованих даних у Firestore
 * - Встановлюється в true при виявленні зашифрованих даних
 * - Передається в useSyncDebounce, який блокує запис якщо isRemoteDataEncrypted=true && !encryptionPassword
 * - Скидається в false тільки після успішного розшифрування або явного вимкнення шифрування
 * 
 * ЖИТТЄВИЙ ЦИКЛ:
 * 1. loadFromFirestore повертає { isEncrypted: true, needsPassword: true } → isRemoteDataEncrypted = true
 * 2. Показується модальне вікно для введення пароля
 * 3. Після успішного розшифрування processFirestoreData() → isRemoteDataEncrypted = false
 * 4. Тепер синхронізація працює нормально
 */
export function useFirestoreSync(
  budgetState: BudgetStateWithSync,
  getSyncStatusText: (key: string) => string,
  user: User | null,
  authLoading: boolean,
  loadedBudgetsRef: React.MutableRefObject<Budgets | null>
) {
  const {
    setSelectedCurrencies,
    setExchangeRates,
    setDays,
    setActiveBudgetId,
    budgets,
    setBudgets,
    setIsInitialLoad,
    setSyncStatus,
    encryptionPassword,
    setEncryptionPassword,
    setIsEncrypted,
    setDisplayCurrency,
    setDisplayCurrencyIndex,
    setBudgetDate,
    setAvailableBudgetBooks,
    setCurrentBudgetBookId,
    currentBudgetBookId,
    availableBudgetBooks
  } = budgetState;

  // Стан для модального вікна введення пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();

  const [isSwitchingBudgetBook, setIsSwitchingBudgetBook] = useState(false);
  
  // 🔒 ЗАПОБІЖНИК ЗАПИСУ: Стан для відстеження зашифрованих даних у Firestore
  const [isRemoteDataEncrypted, setIsRemoteDataEncrypted] = useState(false);
  
  // 🔒 FETCH-FIRST: Стан для блокування запису до завантаження даних з хмари
  // false = дані ще не завантажені, заборонено писати в Firestore
  // true = дані завантажені (або користувач новий), дозволено писати в Firestore
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Допоміжна функція для завантаження даних бюджету
  const loadBudgetData = (budget: typeof budgets[string], budgetId: string, allBudgets: Budgets) => {
    if (budget.selectedCurrencies) {
      setSelectedCurrencies(validateSelectedCurrencies(budget.selectedCurrencies));
    }
    
    if (budget.exchangeRates) {
      setExchangeRates(budget.exchangeRates);
    } else {
      setExchangeRates({});
    }
    
    // Використовуємо лише startBalances (вже в бюджеті)
    const startBalances = budget.startBalances || {};
    
    // Встановлюємо displayCurrency та displayCurrencyIndex з бюджету
    const budgetDisplayCurrency = budget.displayCurrency || 'RON';
    const budgetDisplayCurrencyIndex = budget.displayCurrencyIndex ?? 0;
    setDisplayCurrency(budgetDisplayCurrency);
    setDisplayCurrencyIndex(budgetDisplayCurrencyIndex);
    
    // 🗓️ КОНТЕКСТ ЧАСУ: Встановлюємо budgetDate з бюджету
    // Якщо поле відсутнє (старий запис), використовуємо поточну дату
    if (budget.budgetDate) {
      setBudgetDate(budget.budgetDate);
    } else {
      const now = new Date();
      const defaultDate = { year: now.getFullYear(), month: now.getMonth() };
      setBudgetDate(defaultDate);
      console.log('⚠️ budgetDate відсутній в бюджеті, встановлено поточну дату:', defaultDate);
    }
    
    // Зберігаємо в localStorage для синхронізації
    try {
      localStorage.setItem('displayCurrency', budgetDisplayCurrency);
      localStorage.setItem('displayCurrencyIndex', budgetDisplayCurrencyIndex.toString());
    } catch (error) {
      console.error('Помилка при збереженні displayCurrency в localStorage:', error);
    }
    
    setBudgets((prevBudgets: Budgets) => {
      // ВАЖЛИВО: Під час завантаження з Firestore, використовуємо allBudgets як базовий набір
      // щоб гарантувати, що всі бюджети зберігаються
      const baseBudgets = (prevBudgets && Object.keys(prevBudgets).length > 0 && 
                           Object.keys(prevBudgets).length >= Object.keys(allBudgets).length)
        ? prevBudgets 
        : (allBudgets && Object.keys(allBudgets).length > 0 ? allBudgets : (loadedBudgetsRef.current || {}));
      
      // Гарантуємо, що всі бюджети з allBudgets присутні
      const result: Budgets = { ...baseBudgets };
      
      // Додаємо всі бюджети з allBudgets, якщо їх немає
      Object.keys(allBudgets).forEach(key => {
        if (!result[key]) {
          result[key] = allBudgets[key];
        }
      });
      
      // Оновлюємо активний бюджет
      result[budgetId] = {
        ...budget,
        startBalances: startBalances,
        displayCurrency: budgetDisplayCurrency,
        displayCurrencyIndex: budgetDisplayCurrencyIndex
      };
      
      return result;
    });
    
    setDays(normalizeDaysArray(
      budget.days || [],
      budget.budgetDate?.year,
      budget.budgetDate?.month
    ));
  };

  // Допоміжна функція для ініціалізації порожнього бюджету
  const initializeEmptyBudget = (statusKey: 'saved' | 'local' | 'error' | 'syncing' = user ? 'saved' : 'local'): Budgets => {
    // Створюємо дефолтний бюджет з локалізованою назвою
    const emptyBudget = createEmptyDefaultBudget();
    const defaultBudget = emptyBudget['default'];
    
    setSelectedCurrencies(DEFAULT_CURRENCIES);
    setExchangeRates({});
    setDays(defaultBudget.days); // Використовуємо дні з дефолтного бюджету
    setBudgets(emptyBudget);
    loadedBudgetsRef.current = emptyBudget;
    setActiveBudgetId('default');
    setSyncStatus(getSyncStatusText(statusKey));

    // Для авторизованого користувача показуємо стандартну книгу (Особистий),
    // щоб селектор книг та кнопка "створити другу книгу" працювали одразу.
    if (user) {
      setAvailableBudgetBooks([
        {
          id: DEFAULT_BUDGET_BOOK_ID,
          displayLabel: translate('budgetBook.personalLabel'),
          isReadOnly: false
        }
      ]);
    } else {
      setAvailableBudgetBooks([]);
    }
    setCurrentBudgetBookId(DEFAULT_BUDGET_BOOK_ID);

    // 🔒 FETCH-FIRST: Новий користувач без даних, дозволяємо запис
    setIsDataLoaded(true);
    console.log('✅ Новий користувач, створено порожній бюджет. Запис розблоковано.');
    return emptyBudget;
  };

  // Функція для обробки даних з Firestore
  const processFirestoreData = (firestoreData: any) => {
    if (!firestoreData) return;

    if (Array.isArray(firestoreData.budgetBooks)) {
      setAvailableBudgetBooks(firestoreData.budgetBooks);
    }
    if (typeof firestoreData.currentBudgetBookId === 'string') {
      setCurrentBudgetBookId(firestoreData.currentBudgetBookId);
    }

    // Встановлюємо isEncrypted, якщо дані зашифровані
    if (firestoreData.isEncrypted) {
      setIsEncrypted(true);
      // 🔒 ЗАПОБІЖНИК: Дані успішно розшифровано, скидаємо блокування
      setIsRemoteDataEncrypted(false);
      console.log('🔓 Дані успішно розшифровано. Запис розблоковано.');
    } else {
      // Дані не зашифровані
      setIsRemoteDataEncrypted(false);
    }
    // Використовуємо startBalances з бюджетів
    
    if (firestoreData.selectedCurrencies) {
      setSelectedCurrencies(validateSelectedCurrencies(firestoreData.selectedCurrencies));
    }
    
    // Обробляємо курси валют
    if (firestoreData.exchangeRates) {
      const hasNewStructure = hasPairStructure(firestoreData.exchangeRates);
      
      if (hasNewStructure) {
        setExchangeRates(firestoreData.exchangeRates);
      } else {
        // Конвертуємо стару структуру в нову
        const rates: ExchangeRates = {};
        const currencies = validateSelectedCurrencies(firestoreData.selectedCurrencies || DEFAULT_CURRENCIES);
        currencies.forEach(code => {
          if (code === BASE_CURRENCY) return;
          let rate = firestoreData.exchangeRates![code];
          if (rate) {
            const pairKey = `${BASE_CURRENCY}_${code}`;
            const reversePairKey = `${code}_${BASE_CURRENCY}`;
            const rateVal = getBuyRate(rate, 1); 
            const sellRate = roundToDecimals(rateVal * 1.005, 2);

            rates[pairKey] = {
              buy: rateVal,
              sell: sellRate
            };
            rates[reversePairKey] = {
              buy: 1 / sellRate,
              sell: 1 / rateVal
            };
          }
        });
        setExchangeRates(rates);
      }
    } else {
      // Якщо немає курсів, встановлюємо порожній об'єкт
      setExchangeRates({});
    }
    
    if (firestoreData.days) {
      setDays(normalizeDaysArray(
        firestoreData.days,
        firestoreData.budgetDate?.year,
        firestoreData.budgetDate?.month
      ));
    }

    // Обробляємо бюджети
    if (firestoreData.budgets) {
      const preferredActive =
        typeof firestoreData.activeBudgetId === 'string' &&
        firestoreData.budgets[firestoreData.activeBudgetId]
          ? firestoreData.activeBudgetId
          : 'default';
      const budgetsToSet = applyRollingBootToAllBudgets(firestoreData.budgets, preferredActive);
      firestoreData.budgets = budgetsToSet;
      console.log('📦 Завантажено бюджетів з Firestore:', Object.keys(budgetsToSet).length, Object.keys(budgetsToSet));
      
      // ВАЖЛИВО: Спочатку встановлюємо loadedBudgetsRef, щоб він був доступний для loadBudgetData
      loadedBudgetsRef.current = budgetsToSet;
      
      // Відновлюємо вибір бюджету з cookie або Firestore
      try {
        const savedBudgetId = getCookie(ACTIVE_BUDGET_COOKIE_KEY);
        if (savedBudgetId && firestoreData.budgets[savedBudgetId]) {
          // Завантажуємо дані бюджету (це встановить всі бюджети через loadBudgetData)
          loadBudgetData(firestoreData.budgets[savedBudgetId], savedBudgetId, budgetsToSet);
          setActiveBudgetId(savedBudgetId);
        } else if (firestoreData.activeBudgetId && firestoreData.budgets[firestoreData.activeBudgetId]) {
          // Завантажуємо дані бюджету (це встановить всі бюджети через loadBudgetData)
          loadBudgetData(firestoreData.budgets[firestoreData.activeBudgetId], firestoreData.activeBudgetId, budgetsToSet);
          setActiveBudgetId(firestoreData.activeBudgetId);
        } else {
          // Беремо перший доступний бюджет
          const budgetKeys = Object.keys(firestoreData.budgets);
          if (budgetKeys.length > 0) {
            const firstBudgetId = budgetKeys[0];
            // Завантажуємо дані бюджету (це встановить всі бюджети через loadBudgetData)
            loadBudgetData(firestoreData.budgets[firstBudgetId], firstBudgetId, budgetsToSet);
            setActiveBudgetId(firstBudgetId);
          } else {
            // Якщо немає бюджетів, встановлюємо порожній набір
            setBudgets(budgetsToSet);
          }
        }
      } catch (error) {
        console.error('Помилка при відновленні вибору бюджету з cookie:', error);
        if (firestoreData.activeBudgetId && firestoreData.budgets[firestoreData.activeBudgetId]) {
          // Завантажуємо дані бюджету (це встановить всі бюджети через loadBudgetData)
          loadBudgetData(firestoreData.budgets[firestoreData.activeBudgetId], firestoreData.activeBudgetId, budgetsToSet);
          setActiveBudgetId(firestoreData.activeBudgetId);
        } else {
          // Якщо не вдалося завантажити, встановлюємо всі бюджети
          setBudgets(budgetsToSet);
        }
      }
      
      // ВАЖЛИВО: Після завантаження всіх даних, переконуємося що loadedBudgetsRef містить всі бюджети
      // Використовуємо setTimeout, щоб гарантувати, що setBudgets завершився
      setTimeout(() => {
        if (loadedBudgetsRef.current && Object.keys(loadedBudgetsRef.current).length < Object.keys(budgetsToSet).length) {
          console.log('⚠️ Відновлення loadedBudgetsRef з повним набором бюджетів');
          loadedBudgetsRef.current = budgetsToSet;
        }
      }, 50);
    } else if (firestoreData.activeBudgetId) {
      setActiveBudgetId(firestoreData.activeBudgetId);
    }
    
    setSyncStatus(getSyncStatusText('saved'));
  };

  const defaultFirestoreSaveContext: FirestoreBudgetContext = {
    budgetBookId: DEFAULT_BUDGET_BOOK_ID,
    isReadOnly: false
  };

  /**
   * Extracts a single usable budget object out of a localStorage backup string.
   * Handles the current `{ budgets, activeBudgetId }` layout and the legacy flat layout.
   */
  const extractBudgetFromBackup = (backup: string | null): Budget | null => {
    if (!backup) return null;
    let parsed: any = null;
    try {
      parsed = JSON.parse(backup);
    } catch (e) {
      console.error('⚠️ Помилка парсингу localStorage backup:', e);
      return null;
    }
    if (!parsed) return null;

    let source: any = null;
    if (parsed.budgets && typeof parsed.budgets === 'object') {
      const activeId = parsed.activeBudgetId || 'default';
      source = parsed.budgets[activeId];
      if (!source) {
        const firstKey = Object.keys(parsed.budgets)[0];
        source = firstKey ? parsed.budgets[firstKey] : null;
      }
    }
    // Legacy flat layout (no budgets map)
    if (!source && (parsed.days || parsed.startBalances || parsed.selectedCurrencies)) {
      source = parsed;
    }
    if (!source) return null;

    return {
      name: translate('budget.defaultBudgetName'),
      startBalances: source.startBalances || {},
      selectedCurrencies: validateSelectedCurrencies(source.selectedCurrencies || DEFAULT_CURRENCIES),
      exchangeRates: source.exchangeRates || {},
      days: normalizeDaysArray(
        source.days || [],
        source.budgetDate?.year,
        source.budgetDate?.month
      ),
      displayCurrency: source.displayCurrency || 'RON',
      displayCurrencyIndex: source.displayCurrencyIndex ?? 0,
      budgetDate: source.budgetDate,
      monthsByKey: source.monthsByKey,
      monthlyPlans: source.monthlyPlans
    };
  };

  /**
   * New-user sign-in path: migrate any pre-login localStorage budget into the
   * `default` book once, otherwise start an empty book. ALWAYS resolves the
   * loading guards (`isDataLoaded`, sync status) so the UI never hangs on "syncing".
   */
  const handleNewUserSignIn = async (localStorageBackup: string | null): Promise<void> => {
    // Очищаємо cookies від попереднього користувача
    document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = `${ACTIVE_BUDGET_BOOK_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    const recovered = extractBudgetFromBackup(localStorageBackup);

    if (!recovered) {
      console.log('📦 Новий користувач без локальних даних — створюємо порожню книгу в Firestore.');
      try {
        const emptyBudget = initializeEmptyBudget('syncing');
        await saveToFirestore(
          user,
          emptyBudget,
          DEFAULT_BUDGET_BOOK_ID,
          false,
          setSyncStatus,
          getSyncStatusText,
          null,
          setIsEncrypted,
          defaultFirestoreSaveContext,
          { throwOnError: true }
        );

        const savedData = await loadFromFirestore(user, null);
        if (savedData && !('isEncrypted' in savedData && 'needsPassword' in savedData)) {
          processFirestoreData(savedData);
          setIsDataLoaded(true);
          console.log('✅ Порожню книгу нового користувача створено та завантажено.');
        } else {
          initializeEmptyBudget('error');
        }
      } catch (error) {
        console.error('Помилка створення порожньої книги нового користувача:', error);
        initializeEmptyBudget('error');
      }
      return;
    }

    console.log('📦 Міграція локального бюджету нового користувача у книгу "default".');
    try {
      const budgetsToSave: Budgets = { default: recovered };
      await saveToFirestore(
        user,
        budgetsToSave,
        'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        null,
        setIsEncrypted,
        defaultFirestoreSaveContext,
        { throwOnError: true }
      );

      const savedData = await loadFromFirestore(user, null);
      if (savedData && !('isEncrypted' in savedData && 'needsPassword' in savedData)) {
        processFirestoreData(savedData);
        setIsDataLoaded(true);
        console.log('✅ Дані нового користувача збережені та завантажені. Запис розблоковано.');
      } else {
        // Збереження не повернуло валідних даних — не залишаємо UI у "syncing".
        initializeEmptyBudget('error');
      }
    } catch (error) {
      console.error('Помилка міграції локального бюджету нового користувача:', error);
      initializeEmptyBudget('error');
    }
  };

  const switchBudgetBook = async (bookId: string) => {
    if (!user || bookId === currentBudgetBookId) return;
    setIsSwitchingBudgetBook(true);
    try {
      const res = await loadBudgetBookDocumentForUser(user, bookId, encryptionPassword ?? null);
      if (res === 'needsPassword') {
        setIsRemoteDataEncrypted(true);
        setShowPasswordModal(true);
        return;
      }
      if (!res) return;
      processFirestoreData(res.data);
      setAvailableBudgetBooks(
        availableBudgetBooks.map((b) =>
          b.id === bookId ? { ...b, isReadOnly: res.isReadOnly } : b
        )
      );
      setCurrentBudgetBookId(bookId);
      await persistUserCurrentBudgetBookId(user, bookId);
      setCookie(ACTIVE_BUDGET_BOOK_COOKIE_KEY, bookId, 365);
    } catch (err) {
      console.error('switchBudgetBook', err);
    } finally {
      setIsSwitchingBudgetBook(false);
    }
  };

  /** Loads a book document and makes it the active book (used after create/delete). */
  const loadAndActivateBook = async (bookId: string) => {
    if (!user) return;
    const res = await loadBudgetBookDocumentForUser(user, bookId, encryptionPassword ?? null);
    if (res === 'needsPassword') {
      setIsRemoteDataEncrypted(true);
      setShowPasswordModal(true);
      return;
    }
    if (!res) return;
    processFirestoreData(res.data);
    setCurrentBudgetBookId(bookId);
    await persistUserCurrentBudgetBookId(user, bookId);
    setCookie(ACTIVE_BUDGET_BOOK_COOKIE_KEY, bookId, 365);
  };

  /** Creates a second budget book (max MAX_USER_BUDGET_BOOKS) and switches to it. */
  const createBook = async (displayLabel: string) => {
    if (!BUDGET_BOOK_CREATE_ENABLED || !user) return;
    const label = (displayLabel || '').trim();
    if (!label) return;
    setIsSwitchingBudgetBook(true);
    try {
      // Переконуємось, що поточна (default) книга збережена, перш ніж відгалужувати нову.
      await saveToFirestore(
        user,
        budgets,
        'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        encryptionPassword ?? null,
        setIsEncrypted,
        { budgetBookId: currentBudgetBookId, isReadOnly: false }
      );

      const existing = await listBudgetBookSummaries(user);
      if (existing.length >= MAX_USER_BUDGET_BOOKS) {
        console.warn('⛔ Досягнуто ліміт книг бюджету.');
        return;
      }

      const emptyBudgets = createEmptyDefaultBudget();
      const newId = await createBudgetBook(user, label, emptyBudgets, encryptionPassword ?? null);

      const refreshed = await listBudgetBookSummaries(user);
      setAvailableBudgetBooks(refreshed);
      await loadAndActivateBook(newId);
    } catch (err) {
      console.error('createBook', err);
    } finally {
      setIsSwitchingBudgetBook(false);
    }
  };

  /** Renames a budget book label. */
  const renameBook = async (bookId: string, displayLabel: string) => {
    if (!user) return;
    const label = (displayLabel || '').trim();
    if (!label) return;
    try {
      await renameBudgetBook(user, bookId, label);
      setAvailableBudgetBooks(
        availableBudgetBooks.map((b) => (b.id === bookId ? { ...b, displayLabel: label } : b))
      );
    } catch (err) {
      console.error('renameBook', err);
    }
  };

  /** Deletes a non-default budget book and falls back to the default book. */
  const deleteBook = async (bookId: string) => {
    if (!user || bookId === DEFAULT_BUDGET_BOOK_ID) return;
    setIsSwitchingBudgetBook(true);
    try {
      await deleteBudgetBook(user, bookId);
      const refreshed = await listBudgetBookSummaries(user);
      setAvailableBudgetBooks(refreshed);
      if (currentBudgetBookId === bookId) {
        await loadAndActivateBook(DEFAULT_BUDGET_BOOK_ID);
      }
    } catch (err) {
      console.error('deleteBook', err);
    } finally {
      setIsSwitchingBudgetBook(false);
    }
  };

  // Завантаження даних з Firestore при вході користувача
  // Очищаємо loadedBudgetsRef коли користувач виходить з акаунту
  useEffect(() => {
    if (!user && !authLoading) {
      loadedBudgetsRef.current = null;
      // 🔒 FETCH-FIRST: Скидаємо блокування при виході (буде встановлено при наступному вході)
      setIsDataLoaded(false);
      setAvailableBudgetBooks([]);
      setCurrentBudgetBookId(DEFAULT_BUDGET_BOOK_ID);
    }
  }, [user, authLoading, loadedBudgetsRef, setAvailableBudgetBooks, setCurrentBudgetBookId]);

  useEffect(() => {
    if (authLoading) return;

    let isMounted = true;

    const loadData = async () => {
      if (user) {
        setIsInitialLoad(true);
        // 🔒 FETCH-FIRST: КРИТИЧНО! Блокуємо запис на час завантаження з Firestore
        // Це запобігає перезапису свіжих даних застарілими з LocalStorage
        setIsDataLoaded(false);
        
        // 🔒 БЕЗПЕКА + СИНХРОНІЗАЦІЯ: Зберігаємо копію localStorage перед очищенням
        // Потрібно для випадку: користувач імпортував дані → логініться → дані не втрачаються
        let localStorageBackup: string | null = null;
        try {
          localStorageBackup = localStorage.getItem('budgetTrackerData');
          console.log('🔒 Збережено копію localStorage:', localStorageBackup ? 'Є дані' : 'Порожньо');
        } catch (error) {
          console.error('⚠️ Помилка читання localStorage:', error);
        }
        
        // 🔒 БЕЗПЕКА: ОДРАЗУ очищаємо localStorage при вході користувача!
        // Це вирішує ДВІ проблеми:
        // 1. Безпека: Ніхто не може побачити дані в LocalStorage без правильного пароля
        // 2. Синхронізація: Старі дані з LocalStorage не конфліктують з актуальними даними з Firebase
        // Після успішного завантаження з Firebase, дані будуть збережені в LocalStorage знову
        try {
          localStorage.removeItem('budgetTrackerData');
          console.log('🔒 LocalStorage очищено при вході користувача (безпека + синхронізація)');
        } catch (error) {
          console.error('⚠️ Помилка очищення localStorage:', error);
        }
        
        try {
          const firestoreData = await loadFromFirestore(user, encryptionPassword);
          
          if (!isMounted) return;
          
          // Перевіряємо, чи дані зашифровані і потрібен пароль
          if (firestoreData && 'isEncrypted' in firestoreData && 'needsPassword' in firestoreData) {
            // 🔒 ЗАПОБІЖНИК: Встановлюємо прапорець, що в хмарі є зашифровані дані
            setIsRemoteDataEncrypted(true);
            console.warn('🔒 Виявлено зашифровані дані в Firestore. Запис заблоковано до введення пароля.');
            
            // 🔒 БЕЗПЕКА: Показуємо порожній бюджет до введення пароля
            // LocalStorage вже очищено, створюємо чистий стан
            initializeEmptyBudget();
            // ВАЖЛИВО: Скидаємо isDataLoaded = false, щоб запобігти запису порожнього бюджету в Firebase
            setIsDataLoaded(false);
            
            // Потрібен пароль - показуємо модальне вікно
            // НЕ очищаємо passwordError тут, щоб зберегти попередню помилку, якщо вона була
            setShowPasswordModal(true);
            setIsInitialLoad(false);
            return;
          }
          
          if (firestoreData) {
            processFirestoreData(firestoreData);
            // 🔒 FETCH-FIRST: Дані успішно завантажені з Firestore, розблоковуємо запис
            setIsDataLoaded(true);
            console.log('✅ Дані завантажені з Firestore. Запис розблоковано.');
          } else {
            // Новий користувач (книг ще немає) — мігруємо локальні дані або стартуємо чисту книгу.
            await handleNewUserSignIn(localStorageBackup);
          }
        } catch (error) {
          console.error('Помилка при завантаженні даних з Firestore:', error);
          if (isMounted) {
            if (error instanceof WrongPasswordError) {
              // Невірний пароль - показуємо помилку в модальному вікні
              setPasswordError(translate('encryption.wrongPassword'));
              setShowPasswordModal(true);
              setIsInitialLoad(false);
            } else if (error instanceof UnsupportedEncryptionFormatError) {
              // Дані зашифровані застарілим форматом - жодний пароль не допоможе
              setPasswordError(translate('encryption.unsupportedFormat'));
              setShowPasswordModal(true);
              setIsInitialLoad(false);
            } else {
              setSyncStatus(getSyncStatusText('error'));
            }
          }
        } finally {
          if (isMounted && !showPasswordModal) {
            // ВАЖЛИВО: Затримка перед встановленням isInitialLoad в false,
            // щоб гарантувати, що всі оновлення стану (setBudgets) завершилися
            // Це запобігає збереженню неповних даних через useSyncDebounce
            // Збільшуємо затримку до 500мс для надійності
            setTimeout(() => {
              if (isMounted) {
                setIsInitialLoad(false);
              }
            }, 500);
          }
        }
      } else {
        // Якщо користувач не авторизований, перевіряємо чи є дані в localStorage
        // Якщо localStorage порожній (після logout/delete), не завантажуємо дані
        const hasLocalData = localStorage.getItem('budgetTrackerData');
        if (!hasLocalData) {
          // localStorage очищено - скидаємо всі дані
          setSelectedCurrencies(DEFAULT_CURRENCIES);
          setExchangeRates({});
          setDays([]);
          setBudgets({});
          setActiveBudgetId('default');
          setSyncStatus(getSyncStatusText('local'));
          setIsInitialLoad(false);
          return;
        }
        
        // Завантажуємо дані з localStorage тільки якщо вони є
        const localData = loadFromLocalStorage();
        if (localData) {
          if (localData.budgets && Object.keys(localData.budgets).length > 0) {
            // Після logout має бути тільки один бюджет 'default'
            // Якщо є більше одного бюджету, залишаємо тільки 'default'
            let budgetsToLoad = localData.budgets;
            if (Object.keys(budgetsToLoad).length > 1 || !budgetsToLoad['default']) {
              // Виправляємо дані: залишаємо тільки 'default' або створюємо новий пустий
              budgetsToLoad = createEmptyDefaultBudget();
              // Зберігаємо виправлені дані
              saveToLocalStorage(budgetsToLoad, 'default');
            }
            
            // ВАЖЛИВО: Оновлюємо loadedBudgetsRef перед встановленням budgets
            // щоб useBudgetStateSync міг зберегти всі бюджети
            loadedBudgetsRef.current = budgetsToLoad;
            setBudgets(budgetsToLoad);
            
            // Завжди використовуємо 'default' як активний бюджет після logout
            const activeId = 'default';
            setActiveBudgetId(activeId);
            const activeBudget = budgetsToLoad[activeId];
            
            if (activeBudget) {
              if (activeBudget.selectedCurrencies) {
                setSelectedCurrencies(validateSelectedCurrencies(activeBudget.selectedCurrencies));
              }
              
              if (activeBudget.exchangeRates) {
                setExchangeRates(activeBudget.exchangeRates);
              } else {
                setExchangeRates({});
              }
              
              if (activeBudget.days) {
                setDays(normalizeDaysArray(
                  activeBudget.days,
                  activeBudget.budgetDate?.year,
                  activeBudget.budgetDate?.month
                ));
              }
              
              // Встановлюємо displayCurrency та displayCurrencyIndex з бюджету
              const budgetDisplayCurrency = activeBudget.displayCurrency || 'RON';
              const budgetDisplayCurrencyIndex = activeBudget.displayCurrencyIndex ?? 0;
              if (setDisplayCurrency && setDisplayCurrencyIndex) {
                setDisplayCurrency(budgetDisplayCurrency);
                setDisplayCurrencyIndex(budgetDisplayCurrencyIndex);
              }
              
              // Зберігаємо в localStorage для синхронізації
              try {
                localStorage.setItem('displayCurrency', budgetDisplayCurrency);
                localStorage.setItem('displayCurrencyIndex', budgetDisplayCurrencyIndex.toString());
              } catch (error) {
                console.error('Помилка при збереженні displayCurrency в localStorage:', error);
              }
            }
          } else {
            // Якщо немає budgets, завантажуємо плоскі дані (startBalances вже в budgets)
            
            if (localData.selectedCurrencies) {
              setSelectedCurrencies(validateSelectedCurrencies(localData.selectedCurrencies));
            }
            
            if (localData.exchangeRates) {
              setExchangeRates(localData.exchangeRates);
            } else {
              setExchangeRates({});
            }
            
            if (localData.days) {
              setDays(normalizeDaysArray(
                localData.days,
                localData.budgetDate?.year,
                localData.budgetDate?.month
              ));
            }
          }
        }
        
        setSyncStatus(getSyncStatusText('local'));
        setIsInitialLoad(false);
        // 🔒 FETCH-FIRST: Дані завантажені з localStorage, дозволяємо запис
        setIsDataLoaded(true);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, encryptionPassword]);

  // Обробка введення пароля
  const handlePasswordSubmit = async (password: string) => {
    console.log('🔑 Обробка введення пароля...');
    // НЕ очищаємо помилку тут - вона очиститься автоматично, коли пароль буде правильним
    // або залишиться, якщо пароль невірний
    
    // ВАЖЛИВО: НЕ встановлюємо пароль і НЕ закриваємо модальне вікно ДО перевірки пароля
    // Спочатку перевіряємо пароль, і тільки якщо він правильний - встановлюємо та закриваємо
    
    // Перезавантажуємо дані з новим паролем для перевірки
    // ВАЖЛИВО: Викликаємо loadFromFirestore безпосередньо з паролем, оскільки state може не встигнути оновитися
    if (user) {
      setIsInitialLoad(true);
      try {
        console.log('🔑 Завантаження даних з паролем для перевірки...');
        const firestoreData = await loadFromFirestore(user, password);
        
        // Обробляємо дані так само, як в основному useEffect
        if (firestoreData && 'isEncrypted' in firestoreData && 'needsPassword' in firestoreData) {
          console.log('🔑 ⚠️ Пароль не прийнято, потрібен пароль');
          const errorText = translate('encryption.wrongPassword');
          // НЕВІРНИЙ ПАРОЛЬ: не закриваємо модальне вікно, не встановлюємо пароль, не очищаємо localStorage
          setPasswordError(errorText);
          setShowPasswordModal(true);
          setIsInitialLoad(false);
          // 🔒 ЗАПОБІЖНИК: Залишаємо isRemoteDataEncrypted = true, щоб захист від запису продовжував працювати
          return;
        }
        
        if (firestoreData) {
          console.log('🔑 ✅ Дані успішно завантажено з паролем');
          
          // ПАРОЛЬ ПРАВИЛЬНИЙ: тепер можна встановити пароль та закрити модальне вікно
          setPasswordError(undefined); // Очищаємо помилку при успішному вході
          setEncryptionPassword(password);
          setShowPasswordModal(false);
          
          // LocalStorage вже очищено при вході користувача (в loadData)
          // Тому просто обробляємо дані з Firestore
          processFirestoreData(firestoreData);
          
          // ВАЖЛИВО: Збільшуємо затримку перед встановленням isInitialLoad в false,
          // щоб гарантувати, що всі оновлення стану (setBudgets, setSelectedCurrencies, тощо) завершилися
          // і useSyncDebounce не збереже старі дані з localStorage в БД
          setTimeout(() => {
            setIsInitialLoad(false);
            // 🔒 FETCH-FIRST: Зашифровані дані успішно завантажені, розблоковуємо запис
            setIsDataLoaded(true);
            console.log('🔑 ✅ isInitialLoad встановлено в false після завантаження з БД. Запис розблоковано.');
          }, 500);
          return;
        }
      } catch (error) {
        console.error('❌ Помилка при завантаженні даних з Firestore (з паролем):', error);
        if (error instanceof WrongPasswordError) {
          console.error('❌ Невірний пароль! Встановлюємо помилку...');
          const errorText = translate('encryption.wrongPassword');
          // НЕВІРНИЙ ПАРОЛЬ: не закриваємо модальне вікно, не встановлюємо пароль, не очищаємо localStorage
          // ВАЖЛИВО: Встановлюємо помилку ПЕРЕД відкриттям модального вікна
          setPasswordError(errorText);
          setShowPasswordModal(true);
          // 🔒 ЗАПОБІЖНИК: Залишаємо isRemoteDataEncrypted = true, щоб захист від запису продовжував працювати
        } else if (error instanceof UnsupportedEncryptionFormatError) {
          // Дані зашифровані застарілим форматом - жодний пароль не допоможе
          setPasswordError(translate('encryption.unsupportedFormat'));
          setShowPasswordModal(true);
        } else {
          setSyncStatus(getSyncStatusText('error'));
        }
        setIsInitialLoad(false);
      }
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordError(undefined);
    setIsInitialLoad(false);
    
    // 🔒 БЕЗПЕКА: При відміні введення пароля створюємо порожній бюджет
    // LocalStorage вже очищено при вході, тому створюємо чистий стан
    console.log('🔒 Відміна введення пароля - створення порожнього бюджету');
    initializeEmptyBudget();
    // 🔒 ЗАПОБІЖНИК: Скидаємо прапорець зашифрованих даних, щоб користувач міг працювати з порожнім бюджетом
    setIsRemoteDataEncrypted(false);
  };

  return {
    showPasswordModal,
    passwordError,
    handlePasswordSubmit,
    handlePasswordCancel,
    isRemoteDataEncrypted,
    isDataLoaded,
    switchBudgetBook,
    isSwitchingBudgetBook,
    createBook,
    renameBook,
    deleteBook
  };
}
