import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LANGUAGE_STORAGE_KEY } from './constants';
import { User } from 'firebase/auth';
import { Day, ExchangeRates, Budget, Budgets, UserData, LoadedUserData } from '../types';
import { validateBudgets } from '../schemas/budgetSchema';
import { handleError } from './errorHandler';
import { encryptData, decryptData, WrongPasswordError } from './encryption';

// Допоміжна функція для конвертації Firestore Timestamp в рядок ISO
const convertTimestampToString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  return undefined;
};

// Функція міграції: забезпечує наявність startBalances
const migrateStartBalances = (budget: Budget | any): Budget => {
  // Якщо вже є startBalances, просто повертаємо бюджет
  if (budget.startBalances && Object.keys(budget.startBalances).length > 0) {
    return budget;
  }

  // Створюємо чистий бюджет з порожніми startBalances
  const cleanBudget: Budget = {
    name: budget.name || 'Бюджет',
    startBalances: budget.startBalances || {},
    days: budget.days || [],
    selectedCurrencies: budget.selectedCurrencies || ['UAH', 'USD', 'EUR'],
    exchangeRates: budget.exchangeRates || {}
  };
  
  return cleanBudget;
};

// Інтерфейс для legacy-даних
interface LegacyUserData {
  days?: Day[];
  selectedCurrencies?: string[];
  exchangeRates?: ExchangeRates;
  budgets?: Budgets;
  activeBudgetId?: string;
  savedAt?: string;
  settings?: any;
}

// Функція для завантаження даних з localStorage з автоматичною міграцією
export const loadFromLocalStorage = (): LoadedUserData | null => {
  try {
    const saved = localStorage.getItem('budgetTrackerData');
    if (!saved) return null;
    
    const parsedData: LegacyUserData = JSON.parse(saved);

    // 🔄 ПЕРЕВІРКА 1: Чи є нова чиста структура?
    if (parsedData.budgets && parsedData.activeBudgetId && Object.keys(parsedData.budgets).length > 0) {
      // Вже нова структура - мігруємо startBalances, якщо потрібно
      const migratedBudgets: Budgets = {};
      for (const [key, budget] of Object.entries(parsedData.budgets)) {
        const migrated = migrateStartBalances(budget);
        migratedBudgets[key] = migrated;
      }
      
      const activeId = parsedData.activeBudgetId;
      const activeBudget = migratedBudgets[activeId];
      
      const cleanData: UserData = {
        activeBudgetId: activeId,
        budgets: migratedBudgets,
        savedAt: parsedData.savedAt
      };
      
      // Зберігаємо чисту структуру назад
      localStorage.setItem('budgetTrackerData', JSON.stringify(cleanData));
      
      // Повертаємо LoadedUserData
      return {
        ...cleanData,
        days: activeBudget?.days || [],
        selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
        exchangeRates: activeBudget?.exchangeRates || {}
      };
    }

    // 🔄 МІГРАЦІЯ: Стара структура - створюємо нову
    console.log('📦 Міграція localStorage зі старої структури на нову');
    
    const settings = parsedData.settings || parsedData;
    const activeBudgetId = parsedData.activeBudgetId || 'default';
    const selectedCurrencies = settings.selectedCurrencies || ['UAH', 'USD', 'EUR'];
    
    // Збираємо початкові баланси
    const startBalances: Record<string, number | null> = {};
    
    // Завантажуємо баланси для інших валют
    selectedCurrencies.forEach((currencyCode: string) => {
      if (!['UAH', 'USD', 'EUR'].includes(currencyCode)) {
        const balanceKey = `startBalance${currencyCode}`;
        if (settings[balanceKey] !== undefined) {
          startBalances[currencyCode] = settings[balanceKey] === null || settings[balanceKey] === '' ? null : settings[balanceKey];
        } else if (startBalances[currencyCode] === undefined) {
          startBalances[currencyCode] = null;
        }
      }
    });
    
    // Створюємо новий бюджет
    const newBudget: Budget = {
      name: 'Основний',
      startBalances: startBalances,
      days: parsedData.days || settings.days || [],
      selectedCurrencies: selectedCurrencies,
      exchangeRates: settings.exchangeRates || {}
    };
    
    const cleanData: UserData = {
      activeBudgetId: activeBudgetId,
      budgets: {
        [activeBudgetId]: newBudget
      },
      savedAt: parsedData.savedAt || new Date().toISOString()
    };
    
    // Зберігаємо чисту структуру в localStorage
    localStorage.setItem('budgetTrackerData', JSON.stringify(cleanData));
    console.log('✅ Міграція localStorage завершена');
    
    // Повертаємо LoadedUserData
    return {
      ...cleanData,
      days: newBudget.days,
      selectedCurrencies: newBudget.selectedCurrencies,
      exchangeRates: newBudget.exchangeRates
    };
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromLocalStorage' }
    );
  }
  return null;
};

// Функція для збереження даних в localStorage (ТІЛЬКИ ЧИСТА СТРУКТУРА)
// ⚠️ УВАГА:
//   - Вся актуальна інформація (включно з динамічними startBalances для будь‑яких валют)
//     зберігається всередині об'єкта `budgets`.
//   - Тому тут ми зберігаємо тільки `budgets` та `activeBudgetId`.
export const saveToLocalStorage = (
  budgets?: Budgets,
  activeBudgetId?: string
): void => {
  try {
    // ВАЖЛИВО: Зберігаємо ТІЛЬКИ чисту структуру без legacy-полів
    const data: UserData = {
      activeBudgetId: activeBudgetId || 'default',
      budgets: budgets || {},
      savedAt: new Date().toISOString()
    };
    
    localStorage.setItem('budgetTrackerData', JSON.stringify(data));
  } catch (error) {
    console.error('Помилка при збереженні в localStorage:', error);
  }
};

// Функція для збереження multi-budget даних в Firestore
// replaceBudgets = true використовується там, де потрібно повністю замінити поле budgets (наприклад, при видаленні бюджету)
export const saveToFirestore = async (
  user: User | null, 
  budgetsToSave: Budgets, 
  activeId: string, 
  replaceBudgets: boolean = false, 
  setSyncStatus?: (status: string) => void, 
  getSyncStatusText?: (key: string) => string,
  encryptionPassword?: string | null,
  setIsEncrypted?: (encrypted: boolean) => void
): Promise<void> => {
  if (!user) return;

  try {
    // Валідація даних перед збереженням
    try {
      validateBudgets(budgetsToSave);
    } catch (validationError) {
      handleError(
        validationError instanceof Error ? validationError : new Error(String(validationError)),
        {
          context: 'storageHelpers',
          action: 'saveToFirestore',
          details: 'Дані бюджетів не пройшли валідацію перед збереженням'
        }
      );
      throw new Error('Дані бюджетів не валідні');
    }

    const userDocRef = doc(db, 'users', user.uid);
    
    // Перевіряємо, чи потрібно шифрувати дані
    if (encryptionPassword) {
      // Шифруємо дані
      const dataToEncrypt = {
        activeBudgetId: activeId,
        budgets: budgetsToSave
      };
      const encryptedData = encryptData(dataToEncrypt, encryptionPassword);
      
      // Зберігаємо зашифровані дані
      // ВАЖЛИВО: Використовуємо setDoc БЕЗ merge: true, щоб ПОВНІСТЮ перезаписати документ
      // Це гарантує, що старі відкриті поля (budgets, activeBudgetId) будуть видалені
      const data = {
        isEncrypted: true,
        encryptedData: encryptedData,
        updatedAt: serverTimestamp()
      };
      
      if (setIsEncrypted) {
        setIsEncrypted(true);
      }
      
      // Повністю перезаписуємо документ - старі поля автоматично видаляться
      await setDoc(userDocRef, data);
    } else {
      // Зберігаємо дані у відкритому вигляді
      // ВАЖЛИВО: Використовуємо setDoc БЕЗ merge: true, щоб ПОВНІСТЮ перезаписати документ
      // Це гарантує, що старі зашифровані поля (encryptedData) будуть видалені
      const data = {
        isEncrypted: false,
        activeBudgetId: activeId,
        budgets: budgetsToSave,
        updatedAt: serverTimestamp()
      };
      
      if (setIsEncrypted) {
        setIsEncrypted(false);
      }
      
      // Повністю перезаписуємо документ - старі поля автоматично видаляться
      await setDoc(userDocRef, data);
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

// Функція для завантаження даних з Firestore з автоматичною міграцією
export const loadFromFirestore = async (
  user: User | null,
  encryptionPassword?: string | null
): Promise<LoadedUserData | { isEncrypted: true; needsPassword: true } | null> => {
  if (!user) return null;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const rawData = userDoc.data();

      // 🔒 Перевіряємо, чи дані зашифровані
      if (rawData.isEncrypted === true && rawData.encryptedData) {
        console.log('🔒 Знайдено зашифровані дані в Firestore');
        
        if (!encryptionPassword) {
          console.log('🔒 ⚠️ Пароль не надано, потрібен пароль для розшифрування');
          return { isEncrypted: true, needsPassword: true };
        }
        
        console.log('🔒 ✅ Пароль надано, починаємо розшифрування...');

        try {
          const decryptedData = decryptData<{ activeBudgetId: string; budgets: Budgets }>(
            rawData.encryptedData,
            encryptionPassword
          );

          console.log('🔓 ✅ Розшифрування успішне!');
          
        // Мігруємо бюджети
        const migratedBudgets: Budgets = {};
        for (const [key, budget] of Object.entries(decryptedData.budgets || {})) {
          const migrated = migrateStartBalances(budget);
          migratedBudgets[key] = migrated;
        }

          const activeId = decryptedData.activeBudgetId && migratedBudgets[decryptedData.activeBudgetId] 
            ? decryptedData.activeBudgetId 
            : Object.keys(migratedBudgets)[0] || 'default';
          
          const activeBudget = migratedBudgets[activeId];
          
          // Повертаємо LoadedUserData
          const result: LoadedUserData = {
            activeBudgetId: activeId,
            budgets: migratedBudgets,
            savedAt: convertTimestampToString(rawData.savedAt),
            updatedAt: convertTimestampToString(rawData.updatedAt),
            isEncrypted: true,
            // Computed values з активного бюджету
            days: activeBudget?.days || [],
            selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
            exchangeRates: activeBudget?.exchangeRates || {}
          };

          console.log('📤 ✅ Завантажено зашифровані дані');
          return result;
        } catch (error) {
          console.error('❌ Помилка при розшифруванні даних:', error);
          if (error instanceof WrongPasswordError) {
            throw error;
          }
          throw error;
        }
      }

      // 🔄 Обробка незашифрованих даних
      
      // Перевіряємо, чи є нова структура
      if (rawData.budgets && rawData.activeBudgetId && Object.keys(rawData.budgets).length > 0) {
        console.log('📦 Знайдено нову структуру budgets');
        
        // Мігруємо бюджети
        const migratedBudgets: Budgets = {};
        let needsMigration = false;
        
        for (const [key, budget] of Object.entries(rawData.budgets as Budgets)) {
          const migratedBudget = migrateStartBalances(budget);
          migratedBudgets[key] = migratedBudget;
        }

        const activeId = rawData.activeBudgetId && migratedBudgets[rawData.activeBudgetId]
          ? rawData.activeBudgetId
          : Object.keys(migratedBudgets)[0] || 'default';

        // Зберігаємо мігровані дані, якщо потрібно
        if (needsMigration) {
          try {
            await setDoc(userDocRef, {
              activeBudgetId: activeId,
              budgets: migratedBudgets,
              updatedAt: serverTimestamp()
            });
            console.log('✅ Міграція завершена - видалено legacy-поля');
          } catch (e) {
            console.error('Помилка при міграції:', e);
          }
        }

        const activeBudget = migratedBudgets[activeId];
        
        // Повертаємо LoadedUserData
        return {
          activeBudgetId: activeId,
          budgets: migratedBudgets,
          savedAt: convertTimestampToString(rawData.savedAt),
          updatedAt: convertTimestampToString(rawData.updatedAt),
          // Computed values
          days: activeBudget?.days || [],
          selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
          exchangeRates: activeBudget?.exchangeRates || {}
        };
      }

      // 🧩 Міграція старої плоскої структури
      console.log('📦 Міграція старої плоскої структури до budgets');
      
      const hasOldFields = 'days' in rawData;

      if (hasOldFields) {
        // Отримуємо мову для іменування бюджету
        let currentLang = 'uk';
        try {
          const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          if (savedLang === 'uk' || savedLang === 'en') {
            currentLang = savedLang;
          }
        } catch (e) {
          console.error('Помилка при отриманні мови:', e);
        }
        
        // Створюємо startBalances
        const startBalances: Record<string, number | null> = {};

        // Створюємо новий бюджет
        const defaultBudget: Budget = {
          name: currentLang === 'en' ? 'Main' : 'Основний',
          startBalances: startBalances,
          days: rawData.days || [],
          selectedCurrencies: rawData.selectedCurrencies || ['UAH', 'USD', 'EUR'],
          exchangeRates: rawData.exchangeRates || {}
        };

        const newBudgets: Budgets = {
          default: defaultBudget
        };

        // Зберігаємо нову структуру і видаляємо старі поля
        try {
          await setDoc(userDocRef, {
            activeBudgetId: 'default',
            budgets: newBudgets,
            updatedAt: serverTimestamp()
          });
          console.log('✅ Міграція завершена - створено структуру budgets');
        } catch (e) {
          console.error('Помилка під час міграції:', e);
        }

        // Повертаємо LoadedUserData
        return {
          activeBudgetId: 'default',
          budgets: newBudgets,
          savedAt: convertTimestampToString(rawData.savedAt),
          updatedAt: convertTimestampToString(rawData.updatedAt),
          // Computed values
          days: defaultBudget.days,
          selectedCurrencies: defaultBudget.selectedCurrencies,
          exchangeRates: defaultBudget.exchangeRates
        };
      }
    } else {
      // Якщо документа немає - це новий користувач
      // НЕ завантажуємо дані з localStorage, щоб не копіювати дані попереднього користувача
      console.log('📦 Новий користувач - документ не знайдено в Firestore');
      
      // Очищаємо localStorage від даних попереднього користувача
      localStorage.removeItem('budgetTrackerData');
      
      // Повертаємо null, щоб система ініціалізувала порожній стан
      return null;
    }
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromFirestore' }
    );
  }
  return null;
};
