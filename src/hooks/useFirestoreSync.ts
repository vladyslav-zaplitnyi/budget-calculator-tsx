import { useEffect, useState } from 'react';
import { loadFromFirestore, loadFromLocalStorage, saveToFirestore, createEmptyDefaultBudget, saveToLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray, createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { getCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';
import { getBuyRate, hasPairStructure } from '../utils/typeGuards';
import { WrongPasswordError } from '../utils/encryption';

const BASE_CURRENCY = 'UAH';

/**
 * Hook для завантаження та синхронізації даних з Firestore
 * Обробляє завантаження даних при вході користувача та синхронізацію з localStorage
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
    isUk,
    setDisplayCurrency,
    setDisplayCurrencyIndex
  } = budgetState;

  // Стан для модального вікна введення пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();

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
    
    // Зберігаємо в localStorage для синхронізації
    try {
      localStorage.setItem('displayCurrency', budgetDisplayCurrency);
      localStorage.setItem('displayCurrencyIndex', budgetDisplayCurrencyIndex.toString());
    } catch (error) {
      console.error('Помилка при збереженні displayCurrency в localStorage:', error);
    }
    
    setBudgets((prevBudgets: Budgets) => {
      const baseBudgets = (prevBudgets && Object.keys(prevBudgets).length > 0) 
        ? prevBudgets 
        : (loadedBudgetsRef.current || allBudgets || {});
      
      return {
        ...baseBudgets,
        [budgetId]: {
          ...budget,
          startBalances: startBalances,
          displayCurrency: budgetDisplayCurrency,
          displayCurrencyIndex: budgetDisplayCurrencyIndex
        }
      };
    });
    
    setDays(normalizeDaysArray(budget.days || []));
  };

  // Допоміжна функція для ініціалізації порожнього бюджету
  const initializeEmptyBudget = () => {
    setSelectedCurrencies(DEFAULT_CURRENCIES);
    setExchangeRates({});
    setDays(createEmptyMonthDays());
    setBudgets({});
    loadedBudgetsRef.current = {};
    setActiveBudgetId('default');
    setSyncStatus(getSyncStatusText('local'));
  };

  // Функція для обробки даних з Firestore
  const processFirestoreData = (firestoreData: any) => {
    if (!firestoreData) return;

    // Встановлюємо isEncrypted, якщо дані зашифровані
    if (firestoreData.isEncrypted) {
      setIsEncrypted(true);
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

            rates[pairKey] = {
              buy: rateVal,
              sell: rateVal * 1.005
            };
            rates[reversePairKey] = {
              buy: 1 / (rateVal * 1.005),
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
    
    if (firestoreData.days && Array.isArray(firestoreData.days) && firestoreData.days.length === 31) {
      setDays(normalizeDaysArray(firestoreData.days));
    } else if (firestoreData.days) {
      setDays(normalizeDaysArray(firestoreData.days));
    }

    // Обробляємо бюджети
    if (firestoreData.budgets) {
      const budgetsToSet = firestoreData.budgets;
      console.log('📦 Завантажено бюджетів з Firestore:', Object.keys(budgetsToSet).length, Object.keys(budgetsToSet));
      loadedBudgetsRef.current = budgetsToSet;
      setBudgets(budgetsToSet);
      
      if (firestoreData.activeBudgetId && budgetsToSet[firestoreData.activeBudgetId]) {
        setActiveBudgetId(firestoreData.activeBudgetId);
      }
      
      // Відновлюємо вибір бюджету з cookie або Firestore
      try {
        const savedBudgetId = getCookie(ACTIVE_BUDGET_COOKIE_KEY);
        if (savedBudgetId && firestoreData.budgets[savedBudgetId]) {
          loadBudgetData(firestoreData.budgets[savedBudgetId], savedBudgetId, budgetsToSet);
          setActiveBudgetId(savedBudgetId);
        } else if (firestoreData.activeBudgetId && firestoreData.budgets[firestoreData.activeBudgetId]) {
          loadBudgetData(firestoreData.budgets[firestoreData.activeBudgetId], firestoreData.activeBudgetId, budgetsToSet);
          setActiveBudgetId(firestoreData.activeBudgetId);
        } else {
          // Беремо перший доступний бюджет
          const budgetKeys = Object.keys(firestoreData.budgets);
          if (budgetKeys.length > 0) {
            const firstBudgetId = budgetKeys[0];
            loadBudgetData(firestoreData.budgets[firstBudgetId], firstBudgetId, budgetsToSet);
            setActiveBudgetId(firstBudgetId);
          }
        }
      } catch (error) {
        console.error('Помилка при відновленні вибору бюджету з cookie:', error);
        if (firestoreData.activeBudgetId && firestoreData.budgets[firestoreData.activeBudgetId]) {
          setActiveBudgetId(firestoreData.activeBudgetId);
        }
      }
    } else if (firestoreData.activeBudgetId) {
      setActiveBudgetId(firestoreData.activeBudgetId);
    }
    
    setSyncStatus(getSyncStatusText('saved'));
  };

  // Завантаження даних з Firestore при вході користувача
  // Очищаємо loadedBudgetsRef коли користувач виходить з акаунту
  useEffect(() => {
    if (!user && !authLoading) {
      loadedBudgetsRef.current = null;
    }
  }, [user, authLoading, loadedBudgetsRef]);

  useEffect(() => {
    if (authLoading) return;

    let isMounted = true;

    const loadData = async () => {
      if (user) {
        setIsInitialLoad(true);
        try {
          const firestoreData = await loadFromFirestore(user, encryptionPassword);
          
          if (!isMounted) return;
          
          // Перевіряємо, чи дані зашифровані і потрібен пароль
          if (firestoreData && 'isEncrypted' in firestoreData && 'needsPassword' in firestoreData) {
            // Потрібен пароль - показуємо модальне вікно
            setShowPasswordModal(true);
            setIsInitialLoad(false);
            return;
          }
          
          if (firestoreData) {
            processFirestoreData(firestoreData);
          } else {
            // Новий користувач - перевіряємо чи є дані в localStorage для збереження
            console.log('📦 Новий користувач - перевірка localStorage');
            
            // Очищаємо cookies від попереднього користувача
            document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            
            // Перевіряємо чи є дані в localStorage
            const localData = loadFromLocalStorage();
            
            if (localData && localData.budgets && Object.keys(localData.budgets).length > 0) {
              // Є дані в localStorage - зберігаємо їх як "Основний"/"Main" бюджет з id 'default'
              console.log('📦 Збереження поточного бюджету з localStorage як Основний/Main');
              
              const currentBudgets = localData.budgets;
              const currentActiveId = localData.activeBudgetId || 'default';
              const currentBudget = currentBudgets[currentActiveId];
              
              if (currentBudget) {
                // Оновлюємо назву бюджету залежно від мови та використовуємо id 'default'
                const budgetName = isUk ? 'Основний' : 'Main';
                const budgetsToSave: Budgets = {
                  'default': {
                    ...currentBudget,
                    name: budgetName,
                    // Переконаємося, що всі обов'язкові поля присутні
                    startBalances: currentBudget.startBalances || {},
                    selectedCurrencies: currentBudget.selectedCurrencies || DEFAULT_CURRENCIES,
                    exchangeRates: currentBudget.exchangeRates || {},
                    days: currentBudget.days || [],
                    displayCurrency: currentBudget.displayCurrency || 'RON',
                    displayCurrencyIndex: currentBudget.displayCurrencyIndex ?? 0
                  }
                };
                
                // Зберігаємо в Firestore з activeBudgetId = 'default'
                saveToFirestore(
                  user,
                  budgetsToSave,
                  'default',
                  false,
                  setSyncStatus,
                  getSyncStatusText,
                  null,
                  setIsEncrypted
                ).then(() => {
                  // Після збереження, завантажуємо дані назад
                  loadFromFirestore(user, null).then((savedData) => {
                    if (savedData && !('isEncrypted' in savedData && 'needsPassword' in savedData)) {
                      processFirestoreData(savedData);
                    }
                  });
                }).catch((error) => {
                  console.error('Помилка при збереженні бюджету:', error);
                  initializeEmptyBudget();
                });
              } else {
                // Немає поточного бюджету - створюємо порожній
                initializeEmptyBudget();
              }
            } else {
              // Немає даних в localStorage - створюємо порожній бюджет
              initializeEmptyBudget();
            }
          }
        } catch (error) {
          console.error('Помилка при завантаженні даних з Firestore:', error);
          if (isMounted) {
            if (error instanceof WrongPasswordError) {
              // Невірний пароль - показуємо помилку в модальному вікні
              setPasswordError(isUk ? 'Невірний пароль. Спробуйте ще раз.' : 'Wrong password. Please try again.');
              setShowPasswordModal(true);
            } else {
              setSyncStatus(getSyncStatusText('error'));
            }
          }
        } finally {
          if (isMounted && !showPasswordModal) {
            setIsInitialLoad(false);
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
                setDays(normalizeDaysArray(activeBudget.days));
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
              setDays(normalizeDaysArray(localData.days));
            }
          }
        }
        
        setSyncStatus(getSyncStatusText('local'));
        setIsInitialLoad(false);
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
    setPasswordError(undefined);
    setEncryptionPassword(password);
    setShowPasswordModal(false);
    
    // Перезавантажуємо дані з новим паролем
    // ВАЖЛИВО: Викликаємо loadFromFirestore безпосередньо з паролем, оскільки state може не встигнути оновитися
    if (user) {
      setIsInitialLoad(true);
      try {
        console.log('🔑 Завантаження даних з паролем...');
        const firestoreData = await loadFromFirestore(user, password);
        
        // Обробляємо дані так само, як в основному useEffect
        if (firestoreData && 'isEncrypted' in firestoreData && 'needsPassword' in firestoreData) {
          console.log('🔑 ⚠️ Пароль не прийнято, потрібен пароль');
          setShowPasswordModal(true);
          setIsInitialLoad(false);
          return;
        }
        
        if (firestoreData) {
          console.log('🔑 ✅ Дані успішно завантажено з паролем');
          processFirestoreData(firestoreData);
        }
      } catch (error) {
        console.error('❌ Помилка при завантаженні даних з Firestore (з паролем):', error);
        if (error instanceof WrongPasswordError) {
          console.error('❌ Невірний пароль!');
          setPasswordError(isUk ? 'Невірний пароль. Спробуйте ще раз.' : 'Wrong password. Please try again.');
          setShowPasswordModal(true);
        } else {
          setSyncStatus(getSyncStatusText('error'));
        }
      } finally {
        setIsInitialLoad(false);
      }
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordError(undefined);
    setIsInitialLoad(false);
  };

  return {
    showPasswordModal,
    passwordError,
    handlePasswordSubmit,
    handlePasswordCancel,
    isUk
  };
}

