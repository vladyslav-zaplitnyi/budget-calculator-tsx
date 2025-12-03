import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { LANGUAGE_STORAGE_KEY } from './constants';
import { User } from 'firebase/auth';
import { Day, ExchangeRates, Budget, Budgets, UserData } from '../types';
import { validateUserData, validateBudgets } from '../schemas/budgetSchema';
import { handleError } from './errorHandler';

// Функція для завантаження даних з localStorage
export const loadFromLocalStorage = (): UserData | null => {
  try {
    const saved = localStorage.getItem('budgetTrackerData');
    if (saved) {
      const parsedData = JSON.parse(saved);

      // Підтримка як старої (плоскої), так і нової структури з settings
      const settings = parsedData.settings || parsedData;

      const data: UserData = {
        startBalanceUAH: settings.startBalanceUAH ?? null,
        startBalanceUSD: settings.startBalanceUSD ?? null,
        startBalanceEUR: settings.startBalanceEUR ?? null,
        usdRate: settings.usdRate ?? 41.5,
        eurRate: settings.eurRate ?? 45,
        days: parsedData.days || settings.days || undefined,
        selectedCurrencies: settings.selectedCurrencies || null,
        exchangeRates: settings.exchangeRates || null,
        budgets: parsedData.budgets || null,
        activeBudgetId: parsedData.activeBudgetId || null
      };

      // Валідація даних
      const validationResult = validateUserData(data);
      if (!validationResult.success) {
        handleError(
          new Error('Дані з localStorage не пройшли валідацію'),
          {
            context: 'storageHelpers',
            action: 'loadFromLocalStorage',
            details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          }
        );
        console.warn('⚠️ Дані з localStorage не валідні, але використовуються для зворотної сумісності');
        // Повертаємо дані навіть якщо валідація не пройшла (для зворотної сумісності)
        return data;
      }

      return validationResult.data;
    }
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'storageHelpers', action: 'loadFromLocalStorage' }
    );
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
    const data: Record<string, unknown> = {
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
    // Використовуємо правильний тип для Firestore
    const data = {
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
export const loadFromFirestore = async (user: User | null): Promise<UserData | null> => {
  if (!user) return null;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const rawData = userDoc.data();

      // Валідація даних з Firestore
      const validationResult = validateUserData(rawData);
      if (!validationResult.success) {
        handleError(
          new Error('Дані з Firestore не пройшли валідацію'),
          {
            context: 'storageHelpers',
            action: 'loadFromFirestore',
            details: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          }
        );
        console.warn('⚠️ Дані з Firestore не валідні, але намагаємося обробити для зворотної сумісності');
      }

      const data = validationResult.success ? validationResult.data : rawData as UserData;

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
          // Валідація кожного бюджету
          try {
            // Видаляємо поля currency та baseCurrency, якщо вони є
            // Використовуємо тимчасовий інтерфейс для деструктуризації
            interface BudgetWithLegacyFields extends Budget {
              currency?: string;
              baseCurrency?: string;
            }
            const { currency, baseCurrency, ...budgetCleaned } = budget as BudgetWithLegacyFields;
            if (currency || baseCurrency) {
              migratedBudgets[key] = budgetCleaned;
              needsMigration = true;
            } else {
              migratedBudgets[key] = budget;
            }
          } catch (error) {
            handleError(
              error instanceof Error ? error : new Error(String(error)),
              {
                context: 'storageHelpers',
                action: 'loadFromFirestore',
                details: `Помилка валідації бюджету ${key}`
              }
            );
            // Пропускаємо невалідний бюджет
            console.warn(`⚠️ Бюджет ${key} не валідний і буде пропущено`);
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
        
        // Створюємо бюджет з тимчасовими полями для міграції
        interface BudgetWithLegacyFields extends Budget {
          baseCurrency?: string;
        }
        const defaultBudget: BudgetWithLegacyFields = {
          name: currentLang === 'en' ? 'Main' : 'Основний',
          baseCurrency: 'UAH', // Це поле буде видалено під час міграції
          startBalanceUAH: data.startBalanceUAH ?? null,
          startBalanceUSD: data.startBalanceUSD ?? null,
          startBalanceEUR: data.startBalanceEUR ?? null,
          usdRate: data.usdRate ?? 41.5,
          eurRate: data.eurRate ?? 45,
          days: data.days || undefined
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
