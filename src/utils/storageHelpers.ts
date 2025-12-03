import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { LANGUAGE_STORAGE_KEY } from './constants';
import { User } from 'firebase/auth';
import { Day, ExchangeRates, Budget, Budgets, UserData } from '../types';

// Функція для завантаження даних з localStorage
export const loadFromLocalStorage = (): UserData | null => {
  try {
    const saved = localStorage.getItem('budgetTrackerData');
    if (saved) {
      const data = JSON.parse(saved);

      // Підтримка як старої (плоскої), так і нової структури з settings
      const settings = data.settings || data;

      return {
        startBalanceUAH: settings.startBalanceUAH ?? null,
        startBalanceUSD: settings.startBalanceUSD ?? null,
        startBalanceEUR: settings.startBalanceEUR ?? null,
        usdRate: settings.usdRate ?? 41.5,
        eurRate: settings.eurRate ?? 45,
        days: data.days || settings.days || undefined,
        selectedCurrencies: settings.selectedCurrencies || null,
        exchangeRates: settings.exchangeRates || null,
        budgets: data.budgets || null,
        activeBudgetId: data.activeBudgetId || null
      };
    }
  } catch (error) {
    console.error('Помилка при завантаженні з localStorage:', error);
  }
  return null;
};

// Функція для збереження даних в localStorage (з підтримкою multi-budget)
export const saveToLocalStorage = (
  startBalanceUAH: number | null, 
  startBalanceUSD: number | null, 
  startBalanceEUR: number | null, 
  usdRate: number, 
  eurRate: number, 
  days: Day[], 
  selectedCurrencies: string[], 
  exchangeRates: ExchangeRates,
  budgets?: Budgets,
  activeBudgetId?: string
): void => {
  try {
    const data: any = {
      startBalanceUAH,
      startBalanceUSD,
      startBalanceEUR,
      usdRate,
      eurRate,
      days,
      ...(selectedCurrencies && { selectedCurrencies }),
      ...(exchangeRates && { exchangeRates }),
      savedAt: new Date().toISOString()
    };
    
    // Зберігаємо також budgets та activeBudgetId, якщо вони передані
    if (budgets && Object.keys(budgets).length > 0) {
      data.budgets = budgets;
    }
    if (activeBudgetId) {
      data.activeBudgetId = activeBudgetId;
    }
    
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
  getSyncStatusText?: (key: string) => string
): Promise<void> => {
  if (!user) return;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const data: any = {
      activeBudgetId: activeId,
      budgets: budgetsToSave,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (replaceBudgets) {
      // updateDoc із повною заміною поля budgets, щоб видалені бюджети не залишалися в документі
      await updateDoc(userDocRef, data);
    } else {
      // merge: true — акуратне оновлення без видалення інших полів
      await setDoc(userDocRef, data, { merge: true });
    }
    if (setSyncStatus && getSyncStatusText) {
      setSyncStatus(getSyncStatusText('saved'));
    }
  } catch (error) {
    console.error('Помилка при збереженні в Firestore:', error);
    if (setSyncStatus && getSyncStatusText) {
      setSyncStatus(getSyncStatusText('error'));
    }
  }
};

// Функція для завантаження даних з Firestore
export const loadFromFirestore = async (user: User | null): Promise<UserData | null> => {
  if (!user) return null;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const data = userDoc.data();

      // 🔁 Якщо вже є нова multi-budget структура
      if (data.budgets && typeof data.budgets === 'object' && Object.keys(data.budgets).length > 0) {
        let activeId = data.activeBudgetId;
        const budgetKeys = Object.keys(data.budgets);

        if (!activeId || !data.budgets[activeId]) {
          // Якщо activeBudgetId не валідний – беремо перший бюджет і оновлюємо документ
          activeId = budgetKeys[0];
          try {
            await updateDoc(userDocRef, {
              activeBudgetId: activeId,
              updatedAt: new Date().toISOString()
            });
          } catch (e) {
            console.error('Помилка при оновленні activeBudgetId під час міграції:', e);
          }
        }

        // 🔄 Міграція: видаляємо зайві поля currency та baseCurrency з бюджетів
        let needsMigration = false;
        const migratedBudgets: Budgets = {};
        for (const [key, budget] of Object.entries(data.budgets as Budgets)) {
          // Видаляємо поля currency та baseCurrency, якщо вони є
          const { currency, baseCurrency, ...budgetCleaned } = budget as any;
          if (currency || baseCurrency) {
            migratedBudgets[key] = budgetCleaned;
            needsMigration = true;
          } else {
            migratedBudgets[key] = budget;
          }
        }

        // Якщо була міграція, зберігаємо оновлені дані
        if (needsMigration) {
          try {
            await updateDoc(userDocRef, {
              budgets: migratedBudgets,
              updatedAt: new Date().toISOString()
            });
            console.log('📦 Міграція: видалено зайві поля currency та baseCurrency з бюджетів');
          } catch (e) {
            console.error('Помилка при міграції бюджетів:', e);
          }
        }

        const activeBudget = migratedBudgets[activeId] || {};

        return {
          startBalanceUAH: activeBudget.startBalanceUAH ?? null,
          startBalanceUSD: activeBudget.startBalanceUSD ?? null,
          startBalanceEUR: activeBudget.startBalanceEUR ?? null,
          usdRate: activeBudget.usdRate ?? 41.5,
          eurRate: activeBudget.eurRate ?? 45,
          days: activeBudget.days || undefined,
          budgets: migratedBudgets,
          activeBudgetId: activeId
        };
      }

      // 🧩 Міграція старої плоскої структури до multi-budget
      const hasOldFields =
        'days' in data ||
        'usdRate' in data ||
        'eurRate' in data ||
        'startBalanceUAH' in data ||
        'startBalanceUSD' in data ||
        'startBalanceEUR' in data;

      if (hasOldFields) {
        // Отримуємо мову з localStorage для правильного іменування бюджету
        let currentLang = 'uk';
        try {
          const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          if (savedLang === 'uk' || savedLang === 'en') {
            currentLang = savedLang;
          }
        } catch (e) {
          console.error('Помилка при отриманні мови з localStorage:', e);
        }
        
        const defaultBudget: Budget = {
          name: currentLang === 'en' ? 'Main' : 'Основний',
          // @ts-ignore
          baseCurrency: 'UAH',
          startBalanceUAH: data.startBalanceUAH ?? null,
          startBalanceUSD: data.startBalanceUSD ?? null,
          startBalanceEUR: data.startBalanceEUR ?? null,
          usdRate: data.usdRate ?? 41.5,
          eurRate: data.eurRate ?? 45,
          days: data.days || null
        };

        const newBudgets: Budgets = {
          default: defaultBudget
        };

        try {
          await updateDoc(userDocRef, {
            activeBudgetId: 'default',
            budgets: newBudgets,
            startBalanceUAH: deleteField(),
            startBalanceUSD: deleteField(),
            startBalanceEUR: deleteField(),
            usdRate: deleteField(),
            eurRate: deleteField(),
            days: deleteField(),
            updatedAt: new Date().toISOString()
          });
          console.log('📦 Міграція документа користувача до multi-budget структури');
        } catch (e) {
          console.error('Помилка під час міграції документа користувача до multi-budget:', e);
        }

        return {
          startBalanceUAH: defaultBudget.startBalanceUAH,
          startBalanceUSD: defaultBudget.startBalanceUSD,
          startBalanceEUR: defaultBudget.startBalanceEUR,
          usdRate: defaultBudget.usdRate,
          eurRate: defaultBudget.eurRate,
          days: defaultBudget.days || undefined,
          budgets: newBudgets,
          activeBudgetId: 'default'
        };
      }
    } else {
      // Якщо документа немає, мігруємо дані з LocalStorage
      const localData = loadFromLocalStorage();
      if (localData && (localData.startBalanceUAH !== null || localData.days)) {
        console.log('📦 Міграція дані з LocalStorage в Firestore (створення multi-budget)');

        // Отримуємо мову з localStorage для правильного іменування бюджету
        let currentLang = 'uk';
        try {
          const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          if (savedLang === 'uk' || savedLang === 'en') {
            currentLang = savedLang;
          }
        } catch (e) {
          console.error('Помилка при отриманні мови з localStorage:', e);
        }

        const defaultBudget: Budget = {
          name: currentLang === 'en' ? 'Main' : 'Основний',
          // @ts-ignore
          baseCurrency: 'UAH',
          startBalanceUAH: localData.startBalanceUAH ?? null,
          startBalanceUSD: localData.startBalanceUSD ?? null,
          startBalanceEUR: localData.startBalanceEUR ?? null,
          usdRate: localData.usdRate ?? 41.5,
          eurRate: localData.eurRate ?? 45,
          days: localData.days || undefined
        };

        const newBudgets: Budgets = {
          default: defaultBudget
        };

        try {
          await setDoc(
            userDocRef,
            {
              activeBudgetId: 'default',
              budgets: newBudgets,
              savedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          );
        } catch (e) {
          console.error('Помилка при створенні документа multi-budget з LocalStorage:', e);
        }

        return {
          ...localData,
          budgets: newBudgets,
          activeBudgetId: 'default',
          days: localData.days || undefined
        };
      }
    }
  } catch (error) {
    console.error('Помилка при завантаженні з Firestore:', error);
  }
  return null;
};
