import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LANGUAGE_STORAGE_KEY } from './constants';
import { User } from 'firebase/auth';
import { Day, ExchangeRates, Budget, Budgets, UserData } from '../types';
import { validateUserData, validateBudgets } from '../schemas/budgetSchema';
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

// Функція міграції: конвертує старі поля startBalanceUAH/USD/EUR в startBalances
const migrateStartBalances = (budget: Budget): Budget => {
  // Якщо вже є startBalances, просто повертаємо бюджет
  if (budget.startBalances && Object.keys(budget.startBalances).length > 0) {
    // Видаляємо старі поля, якщо вони є
    const { startBalanceUAH, startBalanceUSD, startBalanceEUR, ...cleanedBudget } = budget;
    return cleanedBudget;
  }

  // Якщо немає startBalances, але є старі поля - мігруємо
  const startBalances: Record<string, number | null> = {};
  
  if (budget.startBalanceUAH !== undefined && budget.startBalanceUAH !== null) {
    startBalances['UAH'] = budget.startBalanceUAH;
  }
  if (budget.startBalanceUSD !== undefined && budget.startBalanceUSD !== null) {
    startBalances['USD'] = budget.startBalanceUSD;
  }
  if (budget.startBalanceEUR !== undefined && budget.startBalanceEUR !== null) {
    startBalances['EUR'] = budget.startBalanceEUR;
  }

  // Видаляємо старі поля
  const { startBalanceUAH, startBalanceUSD, startBalanceEUR, ...cleanedBudget } = budget;
  
  return {
    ...cleanedBudget,
    startBalances: Object.keys(startBalances).length > 0 ? startBalances : {}
  };
};

// Функція для завантаження даних з localStorage
export const loadFromLocalStorage = (): UserData | null => {
  try {
    const saved = localStorage.getItem('budgetTrackerData');
    if (saved) {
      const parsedData = JSON.parse(saved);

      // Підтримка як старої (плоскої), так і нової структури з settings
      const settings = parsedData.settings || parsedData;

      // Мігруємо бюджети, якщо вони є
      let budgets = parsedData.budgets;
      if (budgets && typeof budgets === 'object') {
        const migratedBudgets: Budgets = {};
        for (const [key, budget] of Object.entries(budgets as Budgets)) {
          migratedBudgets[key] = migrateStartBalances(budget as Budget);
        }
        budgets = migratedBudgets;
      }

      // Завантажуємо початкові баланси для всіх валют з settings
      // Якщо є budgets, оновлюємо startBalances активного бюджету
      const activeBudgetId = parsedData.activeBudgetId || 'default';
      const selectedCurrencies = settings.selectedCurrencies || ['UAH', 'USD', 'EUR'];
      
      // Функція для завантаження початкових балансів з settings
      const loadStartBalancesFromSettings = (existingBalances: Record<string, number | null> = {}): Record<string, number | null> => {
        const startBalances: Record<string, number | null> = { ...existingBalances };
        
        // Спочатку завантажуємо для валют з selectedCurrencies
        selectedCurrencies.forEach((currencyCode: string) => {
          const balanceKey = `startBalance${currencyCode}`;
          if (settings[balanceKey] !== undefined) {
            const balanceValue = settings[balanceKey];
            startBalances[currencyCode] = balanceValue === null || balanceValue === '' ? null : balanceValue;
          }
        });
        
        // Також завантажуємо для всіх інших валют, які є в settings
        // (наприклад, якщо файл містить startBalanceRON, startBalancePLN тощо)
        Object.keys(settings).forEach((key: string) => {
          if (key.startsWith('startBalance') && key !== 'startBalanceUAH' && key !== 'startBalanceUSD' && key !== 'startBalanceEUR') {
            const currencyCode = key.replace('startBalance', '');
            if (settings[key] !== undefined) {
              const balanceValue = settings[key];
              startBalances[currencyCode] = balanceValue === null || balanceValue === '' ? null : balanceValue;
            }
          }
        });
        
        return startBalances;
      };
      
      if (budgets && typeof budgets === 'object' && budgets[activeBudgetId]) {
        // Оновлюємо startBalances активного бюджету з settings
        const activeBudget = budgets[activeBudgetId];
        const startBalances = loadStartBalancesFromSettings(activeBudget.startBalances);
        
        budgets[activeBudgetId] = {
          ...activeBudget,
          startBalances
        };
      } else if (!budgets || Object.keys(budgets).length === 0) {
        // Якщо budgets немає, створюємо бюджет з початковими балансами для всіх валют
        const startBalances = loadStartBalancesFromSettings();
        
        budgets = {
          [activeBudgetId]: {
            name: 'Основний',
            startBalances: Object.keys(startBalances).length > 0 ? startBalances : {},
            usdRate: settings.usdRate ?? 41.5,
            eurRate: settings.eurRate ?? 45,
            days: parsedData.days || settings.days || undefined,
            selectedCurrencies: selectedCurrencies,
            exchangeRates: settings.exchangeRates || undefined
          }
        };
      }

      const data: UserData = {
        startBalanceUAH: settings.startBalanceUAH ?? null,
        startBalanceUSD: settings.startBalanceUSD ?? null,
        startBalanceEUR: settings.startBalanceEUR ?? null,
        usdRate: settings.usdRate ?? 41.5,
        eurRate: settings.eurRate ?? 45,
        days: parsedData.days || settings.days || undefined,
        selectedCurrencies: settings.selectedCurrencies || undefined,
        exchangeRates: settings.exchangeRates || undefined,
        // Конвертуємо null в undefined для валідації
        budgets: budgets || undefined,
        activeBudgetId: activeBudgetId
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

// Функція для завантаження даних з Firestore
export const loadFromFirestore = async (
  user: User | null,
  encryptionPassword?: string | null
): Promise<UserData | { isEncrypted: true; needsPassword: true } | null> => {
  if (!user) return null;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const rawData = userDoc.data();

      // Перевіряємо, чи дані зашифровані
      if (rawData.isEncrypted === true && rawData.encryptedData) {
        // Дані зашифровані
        console.log('🔒 Знайдено зашифровані дані в Firestore');
        console.log('🔒 isEncrypted:', rawData.isEncrypted);
        console.log('🔒 hasEncryptedData:', !!rawData.encryptedData);
        console.log('🔒 hasPassword:', !!encryptionPassword);
        
        if (!encryptionPassword) {
          // Пароль не надано - повертаємо спеціальний об'єкт
          console.log('🔒 ⚠️ Пароль не надано, потрібен пароль для розшифрування');
          return { isEncrypted: true, needsPassword: true };
        }
        
        console.log('🔒 ✅ Пароль надано, починаємо розшифрування...');

        // Спробуємо розшифрувати
        try {
          console.log('🔐 Початок розшифрування зашифрованих даних...');
          console.log('🔐 Довжина encryptedData:', rawData.encryptedData?.length || 0);
          
          const decryptedData = decryptData<{ activeBudgetId?: string; budgets?: Budgets }>(
            rawData.encryptedData,
            encryptionPassword
          );

          console.log('🔓 ✅ Розшифрування успішне!');
          console.log('🔓 📊 Структура розшифрованих даних:', {
            activeBudgetId: decryptedData.activeBudgetId,
            hasBudgets: !!decryptedData.budgets,
            budgetsCount: decryptedData.budgets ? Object.keys(decryptedData.budgets).length : 0,
            budgetKeys: decryptedData.budgets ? Object.keys(decryptedData.budgets) : []
          });

          // Детальна інформація про кожен бюджет
          if (decryptedData.budgets) {
            console.log('🔓 📋 Деталі бюджетів:');
            Object.entries(decryptedData.budgets).forEach(([budgetId, budget]) => {
              console.log(`  📁 Бюджет "${budgetId}":`, {
                name: budget.name,
                hasDays: !!budget.days,
                daysCount: budget.days?.length || 0,
                hasSelectedCurrencies: !!budget.selectedCurrencies,
                selectedCurrencies: budget.selectedCurrencies,
                hasExchangeRates: !!budget.exchangeRates,
                exchangeRatesKeys: budget.exchangeRates ? Object.keys(budget.exchangeRates) : [],
                startBalanceUAH: budget.startBalanceUAH,
                startBalanceUSD: budget.startBalanceUSD,
                startBalanceEUR: budget.startBalanceEUR,
                usdRate: budget.usdRate,
                eurRate: budget.eurRate
              });
            });
          }

          // Створюємо UserData з розшифрованих даних
          const data: UserData = {
            activeBudgetId: decryptedData.activeBudgetId,
            budgets: decryptedData.budgets,
            savedAt: convertTimestampToString(rawData.savedAt),
            updatedAt: convertTimestampToString(rawData.updatedAt),
            isEncrypted: true
          };

          // Продовжуємо обробку як звичайні дані (використовуємо ту саму логіку, що й нижче)
          // 🔁 Якщо вже є нова multi-budget структура
          if (data.budgets && typeof data.budgets === 'object' && Object.keys(data.budgets).length > 0) {
            let activeId = data.activeBudgetId;
            const budgetKeys = Object.keys(data.budgets);

            // Визначаємо правильний activeId
            if (!activeId || !data.budgets[activeId]) {
              activeId = budgetKeys[0];
            }

            // 🔄 Міграція: видаляємо зайві поля currency та baseCurrency з бюджетів, мігруємо старі баланси
            const migratedBudgets: Budgets = {};
            let needsBalanceMigration = false;
            for (const [key, budget] of Object.entries(data.budgets as Budgets)) {
              try {
                interface BudgetWithLegacyFields extends Budget {
                  currency?: string;
                  baseCurrency?: string;
                }
                const { currency, baseCurrency, ...budgetCleaned } = budget as BudgetWithLegacyFields;
                const migratedBudget = migrateStartBalances(budgetCleaned);
                migratedBudgets[key] = migratedBudget;
                // Перевіряємо, чи була міграція балансів
                if (budget.startBalanceUAH !== undefined || budget.startBalanceUSD !== undefined || budget.startBalanceEUR !== undefined) {
                  needsBalanceMigration = true;
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
                console.warn(`⚠️ Бюджет ${key} не валідний і буде пропущено`);
              }
            }

            const activeBudget = migratedBudgets[activeId] || {};

            console.log('📦 🔄 Обробка зашифрованих даних після міграції:');
            console.log('📦   Active Budget ID:', activeId);
            console.log('📦   Кількість бюджетів:', Object.keys(migratedBudgets).length);
            console.log('📦   Ключі активного бюджету:', Object.keys(activeBudget));
            console.log('📦   📊 Деталі активного бюджету:', {
              name: activeBudget.name,
              startBalances: activeBudget.startBalances,
              usdRate: activeBudget.usdRate,
              eurRate: activeBudget.eurRate,
              daysCount: activeBudget.days?.length || 0,
              selectedCurrencies: activeBudget.selectedCurrencies,
              hasExchangeRates: !!activeBudget.exchangeRates,
              exchangeRatesCount: activeBudget.exchangeRates ? Object.keys(activeBudget.exchangeRates).length : 0
            });

            // ВАЖЛИВО: Для зашифрованих даних НЕ виконуємо updateDoc з відкритими полями!
            // Якщо потрібна міграція, дані будуть автоматично перешифровані та збережені через useSyncDebounce
            // Використовуємо startBalances замість старих полів
            const result: UserData = {
              startBalanceUAH: activeBudget.startBalances?.['UAH'] ?? null,
              startBalanceUSD: activeBudget.startBalances?.['USD'] ?? null,
              startBalanceEUR: activeBudget.startBalances?.['EUR'] ?? null,
              usdRate: activeBudget.usdRate ?? 41.5,
              eurRate: activeBudget.eurRate ?? 45,
              days: activeBudget.days || undefined,
              selectedCurrencies: activeBudget.selectedCurrencies || undefined,
              exchangeRates: activeBudget.exchangeRates || undefined,
              budgets: migratedBudgets,
              activeBudgetId: activeId,
              isEncrypted: true
            };

            console.log('📤 ✅ Фінальний результат для завантаження:');
            console.log('📤   Active Budget ID:', result.activeBudgetId);
            console.log('📤   Кількість бюджетів:', result.budgets ? Object.keys(result.budgets).length : 0);
            console.log('📤   Баланси:', {
              UAH: result.startBalanceUAH,
              USD: result.startBalanceUSD,
              EUR: result.startBalanceEUR
            });
            console.log('📤   Курси валют:', {
              USD: result.usdRate,
              EUR: result.eurRate
            });
            console.log('📤   Кількість днів:', result.days?.length || 0);
            console.log('📤   Вибрані валюти:', result.selectedCurrencies);
            console.log('📤   Курси обміну:', result.exchangeRates ? Object.keys(result.exchangeRates) : 'немає');
            console.log('📤   Is Encrypted:', result.isEncrypted);

            return result;
          }

          // Якщо немає budgets, повертаємо базові дані
          console.log('⚠️ Немає budgets в розшифрованих даних, повертаємо базові дані:', {
            activeBudgetId: data.activeBudgetId,
            hasBudgets: !!data.budgets
          });
          return data;
        } catch (error) {
          console.error('❌ Помилка при розшифруванні даних:', error);
          if (error instanceof WrongPasswordError) {
            console.error('❌ Невірний пароль!');
            // Невірний пароль - повертаємо спеціальний об'єкт
            throw error;
          }
          console.error('❌ Інша помилка при розшифруванні:', error instanceof Error ? error.message : String(error));
          throw error;
        }
      }

      // Конвертуємо Timestamp об'єкти в рядки перед валідацією
      const processedData = {
        ...rawData,
        savedAt: convertTimestampToString(rawData.savedAt),
        updatedAt: convertTimestampToString(rawData.updatedAt)
      };

      // Валідація даних з Firestore
      const validationResult = validateUserData(processedData);
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

      const data = validationResult.success ? validationResult.data : processedData as UserData;

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

        // 🔄 Міграція: видаляємо зайві поля currency та baseCurrency з бюджетів, мігруємо старі баланси
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
            const migratedBudget = migrateStartBalances(budgetCleaned);
            migratedBudgets[key] = migratedBudget;
            
            // Перевіряємо, чи була міграція
            if (currency || baseCurrency || budget.startBalanceUAH !== undefined || budget.startBalanceUSD !== undefined || budget.startBalanceEUR !== undefined) {
              needsMigration = true;
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
            console.log('📦 Міграція: видалено зайві поля currency та baseCurrency з бюджетів, мігровано старі баланси в startBalances');
          } catch (e) {
            console.error('Помилка при міграції бюджетів:', e);
          }
        }

        const activeBudget = migratedBudgets[activeId] || {};

        // Використовуємо startBalances замість старих полів
        return {
          startBalanceUAH: activeBudget.startBalances?.['UAH'] ?? null,
          startBalanceUSD: activeBudget.startBalances?.['USD'] ?? null,
          startBalanceEUR: activeBudget.startBalances?.['EUR'] ?? null,
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
        
        // Створюємо бюджет з міграцією старих полів в startBalances
        const startBalances: Record<string, number | null> = {};
        if (data.startBalanceUAH !== undefined && data.startBalanceUAH !== null) {
          startBalances['UAH'] = data.startBalanceUAH;
        }
        if (data.startBalanceUSD !== undefined && data.startBalanceUSD !== null) {
          startBalances['USD'] = data.startBalanceUSD;
        }
        if (data.startBalanceEUR !== undefined && data.startBalanceEUR !== null) {
          startBalances['EUR'] = data.startBalanceEUR;
        }

        const defaultBudget: Budget = {
          name: currentLang === 'en' ? 'Main' : 'Основний',
          startBalances: Object.keys(startBalances).length > 0 ? startBalances : {},
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
          console.log('📦 Міграція документа користувача до multi-budget структури з startBalances');
        } catch (e) {
          console.error('Помилка під час міграції документа користувача до multi-budget:', e);
        }

        return {
          startBalanceUAH: startBalances['UAH'] ?? null,
          startBalanceUSD: startBalances['USD'] ?? null,
          startBalanceEUR: startBalances['EUR'] ?? null,
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
