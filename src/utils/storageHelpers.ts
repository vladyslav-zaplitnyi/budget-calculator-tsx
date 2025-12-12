import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from 'firebase/auth';
import { Budgets, UserData, LoadedUserData } from '../types';
import { validateBudgets } from '../schemas/budgetSchema';
import { handleError } from './errorHandler';
import { encryptData, decryptData, WrongPasswordError } from './encryption';
import { createEmptyMonthDays } from './dayHelpers';
import { DEFAULT_CURRENCIES } from './currencies';
import { translate } from '../i18n/config';

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
  
  return {
    'default': {
      name: translate('budget.defaultBudgetName'),
      startBalances: emptyStartBalances,
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: emptyDays,
      displayCurrency: 'RON',
      displayCurrencyIndex: 0,
      budgetDate
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
      let activeBudget = parsedData.budgets[activeId];
      
      // Якщо активний бюджет не знайдено, використовуємо перший доступний
      if (!activeBudget) {
        const budgetKeys = Object.keys(parsedData.budgets);
        if (budgetKeys.length > 0) {
          const firstKey = budgetKeys[0];
          activeBudget = parsedData.budgets[firstKey];
          console.log(`⚠️ Активний бюджет ${activeId} не знайдено, використовуємо ${firstKey}`);
        }
      }
      
      if (activeBudget) {
        // Відновлюємо displayCurrency та displayCurrencyIndex з активного бюджету в localStorage
        if (activeBudget.displayCurrency) {
          try {
            localStorage.setItem('displayCurrency', activeBudget.displayCurrency);
          } catch (error) {
            console.error('Помилка при збереженні displayCurrency в localStorage:', error);
          }
        }
        if (activeBudget.displayCurrencyIndex !== undefined) {
          try {
            localStorage.setItem('displayCurrencyIndex', activeBudget.displayCurrencyIndex.toString());
          } catch (error) {
            console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
          }
        }
        
        // Повертаємо LoadedUserData
        return {
          ...parsedData,
          activeBudgetId: activeId, // Гарантуємо правильний activeBudgetId
          days: activeBudget.days || [],
          selectedCurrencies: activeBudget.selectedCurrencies || ['UAH', 'USD', 'EUR'],
          exchangeRates: activeBudget.exchangeRates || {}
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
    
    // Оновлюємо displayCurrency та displayCurrencyIndex в активному бюджеті з localStorage
    // Це забезпечує синхронізацію поточних значень з бюджетом
    const activeBudget = budgetsToSave[activeId];
    if (activeBudget) {
      try {
        const savedDisplayCurrency = localStorage.getItem('displayCurrency');
        if (savedDisplayCurrency && ['UAH', 'USD', 'EUR', 'PLN', 'RON', 'CZK'].includes(savedDisplayCurrency)) {
          activeBudget.displayCurrency = savedDisplayCurrency;
        } else if (!activeBudget.displayCurrency) {
          // Якщо в бюджеті немає значення, встановлюємо дефолт
          activeBudget.displayCurrency = 'RON';
        }
        
        const savedIndex = localStorage.getItem('displayCurrencyIndex');
        if (savedIndex !== null && ['0', '1', '2', '3', '4'].includes(savedIndex)) {
          activeBudget.displayCurrencyIndex = parseInt(savedIndex, 10);
        } else if (activeBudget.displayCurrencyIndex === undefined) {
          // Якщо в бюджеті немає значення, встановлюємо дефолт
          activeBudget.displayCurrencyIndex = 0;
        }
      } catch (error) {
        console.error('Помилка при оновленні displayCurrency в бюджеті:', error);
      }
    }
    
    // Перевіряємо, чи потрібно шифрувати дані
    if (encryptionPassword) {
      // Шифруємо дані
      const dataToEncrypt = {
        activeBudgetId: activeId,
        budgets: budgetsToSave
      };
      const encryptedData = encryptData(dataToEncrypt, encryptionPassword);
      
      const data = {
        isEncrypted: true,
        encryptedData: encryptedData,
        updatedAt: serverTimestamp()
      };
      
      if (setIsEncrypted) {
        setIsEncrypted(true);
      }
      
      await setDoc(userDocRef, data);
    } else {
      const data: any = {
        isEncrypted: false,
        activeBudgetId: activeId,
        budgets: budgetsToSave,
        updatedAt: serverTimestamp()
      };
      
      if (setIsEncrypted) {
        setIsEncrypted(false);
      }
      
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

// Функція для завантаження даних з Firestore
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

      // Перевіряємо, чи дані зашифровані
      if (rawData.isEncrypted === true && rawData.encryptedData) {
        if (!encryptionPassword) {
          return { isEncrypted: true, needsPassword: true };
        }

        try {
          const decryptedData = decryptData<{ activeBudgetId: string; budgets: Budgets }>(
            rawData.encryptedData,
            encryptionPassword
          );

          const budgets = decryptedData.budgets || {};
          const activeId = decryptedData.activeBudgetId && budgets[decryptedData.activeBudgetId] 
            ? decryptedData.activeBudgetId 
            : Object.keys(budgets)[0] || 'default';
          
          const activeBudget = budgets[activeId];
          
          // Відновлюємо displayCurrency та displayCurrencyIndex з активного бюджету в localStorage
          if (activeBudget?.displayCurrency) {
            try {
              localStorage.setItem('displayCurrency', activeBudget.displayCurrency);
            } catch (error) {
              console.error('Помилка при збереженні displayCurrency в localStorage:', error);
            }
          } else {
            // Якщо в бюджеті немає значення, встановлюємо дефолт
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
            // Якщо в бюджеті немає значення, встановлюємо дефолт
            try {
              localStorage.setItem('displayCurrencyIndex', '0');
            } catch (error) {
              console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
            }
          }
          
          const result: LoadedUserData = {
            activeBudgetId: activeId,
            budgets: budgets,
            savedAt: convertTimestampToString(rawData.savedAt),
            updatedAt: convertTimestampToString(rawData.updatedAt),
            isEncrypted: true,
            days: activeBudget?.days || [],
            selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
            exchangeRates: activeBudget?.exchangeRates || {}
          };

          return result;
        } catch (error) {
          if (error instanceof WrongPasswordError) {
            throw error;
          }
          throw error;
        }
      }

      // Обробка незашифрованих даних
      if (rawData.budgets && rawData.activeBudgetId && Object.keys(rawData.budgets).length > 0) {
        const budgets = rawData.budgets as Budgets;
        const activeId = rawData.activeBudgetId && budgets[rawData.activeBudgetId]
          ? rawData.activeBudgetId
          : Object.keys(budgets)[0] || 'default';

        const activeBudget = budgets[activeId];
        
        // Відновлюємо displayCurrency та displayCurrencyIndex з активного бюджету в localStorage
        if (activeBudget?.displayCurrency) {
          try {
            localStorage.setItem('displayCurrency', activeBudget.displayCurrency);
          } catch (error) {
            console.error('Помилка при збереженні displayCurrency в localStorage:', error);
          }
        } else {
          // Якщо в бюджеті немає значення, встановлюємо дефолт
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
          // Якщо в бюджеті немає значення, встановлюємо дефолт
          try {
            localStorage.setItem('displayCurrencyIndex', '0');
          } catch (error) {
            console.error('Помилка при збереженні displayCurrencyIndex в localStorage:', error);
          }
        }
        
        return {
          activeBudgetId: activeId,
          budgets: budgets,
          savedAt: convertTimestampToString(rawData.savedAt),
          updatedAt: convertTimestampToString(rawData.updatedAt),
          days: activeBudget?.days || [],
          selectedCurrencies: activeBudget?.selectedCurrencies || ['UAH', 'USD', 'EUR'],
          exchangeRates: activeBudget?.exchangeRates || {}
        };
      }
    } else {
      // Якщо документа немає - це новий користувач
      // ВАЖЛИВО: НЕ очищаємо budgetTrackerData тут.
      // Локальні дані (імпортовані або створені анонімно) можуть бути використані
      // для ініціалізації першого бюджету в Firestore при першому логіні.
      return null;
    }
  } catch (error) {
    // ВАЖЛИВО: WrongPasswordError має бути кинута далі, щоб бути обробленою в компоненті
    if (error instanceof WrongPasswordError) {
      throw error;
    }
    // Інші помилки обробляємо через handleError
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromFirestore' }
    );
  }
  return null;
};
