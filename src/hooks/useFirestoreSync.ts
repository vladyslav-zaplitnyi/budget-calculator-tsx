import { useEffect } from 'react';
import { loadFromFirestore, loadFromLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES, getDefaultRate } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { getCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';
import { isExchangeRatePair, getBuyRate, hasPairStructure } from '../utils/typeGuards';

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
    setSyncStatus
  } = budgetState;

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
    
    setStartBalanceUAH(budget.startBalanceUAH ?? null);
    setStartBalanceUSD(budget.startBalanceUSD ?? null);
    setStartBalanceEUR(budget.startBalanceEUR ?? null);
    
    setBudgets((prevBudgets: Budgets) => {
      const baseBudgets = (prevBudgets && Object.keys(prevBudgets).length > 0) 
        ? prevBudgets 
        : (loadedBudgetsRef.current || allBudgets || {});
      return {
        ...baseBudgets,
        [budgetId]: {
          ...budget,
          startBalances: budget.startBalances || {}
        }
      };
    });
    
    setDays(normalizeDaysArray(budget.days || []));
  };

  // Завантаження даних з Firestore при вході користувача
  useEffect(() => {
    if (authLoading) return;

    let isMounted = true;

    const loadData = async () => {
      if (user) {
        setIsInitialLoad(true);
        try {
          const firestoreData = await loadFromFirestore(user);
          
          if (!isMounted) return;
          
          if (firestoreData) {
            // Завантажуємо базові дані
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
          } else {
            setSyncStatus(getSyncStatusText('local'));
          }
        } catch (error) {
          console.error('Помилка при завантаженні даних з Firestore:', error);
          if (isMounted) {
            setSyncStatus(getSyncStatusText('error'));
          }
        } finally {
          if (isMounted) {
            setIsInitialLoad(false);
          }
        }
      } else {
        // Якщо користувач не авторизований, завантажуємо дані з localStorage
        const localData = loadFromLocalStorage();
        if (localData) {
          if (localData.budgets && Object.keys(localData.budgets).length > 0) {
            setBudgets(localData.budgets);
            
            if (localData.activeBudgetId && localData.budgets[localData.activeBudgetId]) {
              setActiveBudgetId(localData.activeBudgetId);
              const activeBudget = localData.budgets[localData.activeBudgetId];
              
              setStartBalanceUAH(activeBudget.startBalanceUAH ?? null);
              setStartBalanceUSD(activeBudget.startBalanceUSD ?? null);
              setStartBalanceEUR(activeBudget.startBalanceEUR ?? null);
              
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
  }, [user, authLoading]);
}

