import { useEffect, useState } from 'react';
import { loadFromFirestore, loadFromLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES, getDefaultRate } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { getCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair, getBuyRate, hasPairStructure } from '../utils/typeGuards';
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
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setUsdRate,
    setEurRate,
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
    isEncrypted,
    setIsEncrypted,
    isUk
  } = budgetState;

  // Стан для модального вікна введення пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [pendingLoad, setPendingLoad] = useState<(() => Promise<void>) | null>(null);

  // Допоміжна функція для завантаження даних бюджету
  const loadBudgetData = (budget: typeof budgets[string], budgetId: string, allBudgets: Budgets) => {
    if (budget.selectedCurrencies) {
      setSelectedCurrencies(validateSelectedCurrencies(budget.selectedCurrencies));
    }
    
    if (budget.exchangeRates) {
      const hasNewStructure = hasPairStructure(budget.exchangeRates);
      if (hasNewStructure) {
        setExchangeRates(budget.exchangeRates);
        const uahUsdPair = budget.exchangeRates['UAH_USD'];
        if (isExchangeRatePair(uahUsdPair)) {
          setUsdRate(uahUsdPair.buy);
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        const uahEurPair = budget.exchangeRates['UAH_EUR'];
        if (isExchangeRatePair(uahEurPair)) {
          setEurRate(uahEurPair.buy);
        } else {
          setEurRate(budget.eurRate ?? 45);
        }
      } else {
        setExchangeRates(budget.exchangeRates);
        const usdRateValue = budget.exchangeRates['USD'];
        if (usdRateValue !== undefined) {
          setUsdRate(getBuyRate(usdRateValue, budget.usdRate ?? 41.5));
        } else {
          setUsdRate(budget.usdRate ?? 41.5);
        }
        const eurRateValue = budget.exchangeRates['EUR'];
        if (eurRateValue !== undefined) {
          setEurRate(getBuyRate(eurRateValue, budget.eurRate ?? 45));
        } else {
          setEurRate(budget.eurRate ?? 45);
        }
      }
    } else {
      setUsdRate(budget.usdRate ?? 41.5);
      setEurRate(budget.eurRate ?? 45);
    }
    
    // Використовуємо лише startBalances
    const startBalances = budget.startBalances || {};
    setStartBalanceUAH(startBalances['UAH'] ?? null);
    setStartBalanceUSD(startBalances['USD'] ?? null);
    setStartBalanceEUR(startBalances['EUR'] ?? null);
    
    setBudgets((prevBudgets: Budgets) => {
      const baseBudgets = (prevBudgets && Object.keys(prevBudgets).length > 0) 
        ? prevBudgets 
        : (loadedBudgetsRef.current || allBudgets || {});
      return {
        ...baseBudgets,
        [budgetId]: {
          ...budget,
          startBalances: startBalances
        }
      };
    });
    
    setDays(normalizeDaysArray(budget.days || []));
  };

  // Функція для обробки даних з Firestore
  const processFirestoreData = (firestoreData: any) => {
    if (!firestoreData) return;

    // Встановлюємо isEncrypted, якщо дані зашифровані
    if (firestoreData.isEncrypted) {
      setIsEncrypted(true);
    }
    // Завантажуємо базові дані (для зворотної сумісності зі старими даними)
    // Але переважно використовуємо startBalances з бюджетів
    setStartBalanceUAH(firestoreData.startBalanceUAH ?? null);
    setStartBalanceUSD(firestoreData.startBalanceUSD ?? null);
    setStartBalanceEUR(firestoreData.startBalanceEUR ?? null);
    
    if (firestoreData.selectedCurrencies) {
      setSelectedCurrencies(validateSelectedCurrencies(firestoreData.selectedCurrencies));
    }
    
    // Обробляємо курси валют
    if (firestoreData.exchangeRates) {
      const hasNewStructure = hasPairStructure(firestoreData.exchangeRates);
      
      if (hasNewStructure) {
        setExchangeRates(firestoreData.exchangeRates);
        const uahUsdPair = firestoreData.exchangeRates['UAH_USD'];
        if (isExchangeRatePair(uahUsdPair)) {
          setUsdRate(uahUsdPair.buy);
        } else {
          setUsdRate(firestoreData.usdRate ?? 41.5);
        }
        const uahEurPair = firestoreData.exchangeRates['UAH_EUR'];
        if (isExchangeRatePair(uahEurPair)) {
          setEurRate(uahEurPair.buy);
        } else {
          setEurRate(firestoreData.eurRate ?? 45);
        }
      } else {
        // Конвертуємо стару структуру в нову
        const rates: ExchangeRates = {};
        const currencies = validateSelectedCurrencies(firestoreData.selectedCurrencies || DEFAULT_CURRENCIES);
        currencies.forEach(code => {
          if (code === BASE_CURRENCY) return;
          let rate = firestoreData.exchangeRates![code];
          if (!rate) {
            if (code === 'USD') {
              rate = firestoreData.usdRate ?? 41.5;
            } else if (code === 'EUR') {
              rate = firestoreData.eurRate ?? 45;
            } else {
              rate = getDefaultRate(code);
            }
          }
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
        });
        setExchangeRates(rates);
        setUsdRate(firestoreData.usdRate ?? 41.5);
        setEurRate(firestoreData.eurRate ?? 45);
      }
    } else {
      setUsdRate(firestoreData.usdRate ?? 41.5);
      setEurRate(firestoreData.eurRate ?? 45);
      const rates: ExchangeRates = {};
      const currencies = validateSelectedCurrencies(firestoreData.selectedCurrencies || DEFAULT_CURRENCIES);
      currencies.forEach(code => {
        if (code === BASE_CURRENCY) return;
        let rate;
        if (code === 'USD') {
          rate = firestoreData.usdRate ?? 41.5;
        } else if (code === 'EUR') {
          rate = firestoreData.eurRate ?? 45;
        } else {
          rate = getDefaultRate(code);
        }
        const pairKey = `${BASE_CURRENCY}_${code}`;
        const reversePairKey = `${code}_${BASE_CURRENCY}`;
        rates[pairKey] = {
          buy: rate,
          sell: rate * 1.005
        };
        rates[reversePairKey] = {
          buy: 1 / (rate * 1.005),
          sell: 1 / rate
        };
      });
      setExchangeRates(rates);
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
            setPendingLoad(() => loadData);
            setShowPasswordModal(true);
            setIsInitialLoad(false);
            return;
          }
          
          if (firestoreData) {
            processFirestoreData(firestoreData);
          } else {
            // Новий користувач - очищаємо стан і ініціалізуємо з порожніми даними
            console.log('📦 Новий користувач - ініціалізація порожнього стану');
            
            // Очищаємо cookies від попереднього користувача
            document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            
            setStartBalanceUAH(null);
            setStartBalanceUSD(null);
            setStartBalanceEUR(null);
            setSelectedCurrencies(DEFAULT_CURRENCIES);
            setExchangeRates({});
            setUsdRate(41.5);
            setEurRate(45);
            setDays([]);
            setBudgets({});
            loadedBudgetsRef.current = {};
            setActiveBudgetId('default');
            setSyncStatus(getSyncStatusText('local'));
          }
        } catch (error) {
          console.error('Помилка при завантаженні даних з Firestore:', error);
          if (isMounted) {
            if (error instanceof WrongPasswordError) {
              // Невірний пароль - показуємо помилку в модальному вікні
              setPasswordError(isUk ? 'Невірний пароль. Спробуйте ще раз.' : 'Wrong password. Please try again.');
              setShowPasswordModal(true);
              setPendingLoad(() => loadData);
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
          setStartBalanceUAH(null);
          setStartBalanceUSD(null);
          setStartBalanceEUR(null);
          setSelectedCurrencies(DEFAULT_CURRENCIES);
          setExchangeRates({});
          setUsdRate(41.5);
          setEurRate(45);
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
            // ВАЖЛИВО: Оновлюємо loadedBudgetsRef перед встановленням budgets
            // щоб useBudgetStateSync міг зберегти всі бюджети
            loadedBudgetsRef.current = localData.budgets;
            setBudgets(localData.budgets);
            
            if (localData.activeBudgetId && localData.budgets[localData.activeBudgetId]) {
              setActiveBudgetId(localData.activeBudgetId);
              const activeBudget = localData.budgets[localData.activeBudgetId];
              
              // Використовуємо лише startBalances
              const startBalances = activeBudget.startBalances || {};
              setStartBalanceUAH(startBalances['UAH'] ?? null);
              setStartBalanceUSD(startBalances['USD'] ?? null);
              setStartBalanceEUR(startBalances['EUR'] ?? null);
              
              if (activeBudget.selectedCurrencies) {
                setSelectedCurrencies(validateSelectedCurrencies(activeBudget.selectedCurrencies));
              }
              
              if (activeBudget.exchangeRates) {
                setExchangeRates(activeBudget.exchangeRates);
              }
              
              setUsdRate(activeBudget.usdRate ?? 41.5);
              setEurRate(activeBudget.eurRate ?? 45);
              
              if (activeBudget.days) {
                setDays(normalizeDaysArray(activeBudget.days));
              }
            }
          } else {
            // Якщо немає budgets, завантажуємо плоскі дані
            setStartBalanceUAH(localData.startBalanceUAH ?? null);
            setStartBalanceUSD(localData.startBalanceUSD ?? null);
            setStartBalanceEUR(localData.startBalanceEUR ?? null);
            
            if (localData.selectedCurrencies) {
              setSelectedCurrencies(validateSelectedCurrencies(localData.selectedCurrencies));
            }
            
            if (localData.exchangeRates) {
              setExchangeRates(localData.exchangeRates);
            }
            
            setUsdRate(localData.usdRate ?? 41.5);
            setEurRate(localData.eurRate ?? 45);
            
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
          // Створюємо функцію для повторного завантаження
          const retryLoad = async () => {
            if (user) {
              const retryData = await loadFromFirestore(user, encryptionPassword);
              if (retryData && !('needsPassword' in retryData)) {
                processFirestoreData(retryData);
              }
            }
          };
          setPendingLoad(() => retryLoad);
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
          // Створюємо функцію для повторного завантаження
          const retryLoad = async () => {
            if (user) {
              const retryData = await loadFromFirestore(user, encryptionPassword);
              if (retryData && !('needsPassword' in retryData)) {
                processFirestoreData(retryData);
              }
            }
          };
          setPendingLoad(() => retryLoad);
        } else {
          setSyncStatus(getSyncStatusText('error'));
        }
      } finally {
        setIsInitialLoad(false);
        setPendingLoad(null);
      }
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordError(undefined);
    setPendingLoad(null);
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

