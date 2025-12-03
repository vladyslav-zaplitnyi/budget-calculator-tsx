import { useEffect, useRef } from 'react';
import { loadFromFirestore, saveToFirestore, saveToLocalStorage, loadFromLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES, getDefaultRate } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { getCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates } from '../types';

const BASE_CURRENCY = 'UAH';

export function useBudgetSync(
  budgetState: BudgetStateWithSync, 
  getSyncStatusText: (key: string) => string, 
  user: User | null, 
  authLoading: boolean
) {

  const {
    startBalanceUAH,
    setStartBalanceUAH,
    startBalanceUSD,
    setStartBalanceUSD,
    startBalanceEUR,
    setStartBalanceEUR,
    usdRate,
    setUsdRate,
    eurRate,
    setEurRate,
    selectedCurrencies,
    setSelectedCurrencies,
    exchangeRates,
    setExchangeRates,
    days,
    setDays,
    activeBudgetId,
    setActiveBudgetId,
    budgets,
    setBudgets,
    isInitialLoad,
    setIsInitialLoad,
    setSyncStatus
  } = budgetState;

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef({
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    usdRate,
    eurRate,
    selectedCurrencies,
    exchangeRates,
    days
  });
  const loadedBudgetsRef = useRef<Budgets | null>(null);

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
          setStartBalanceUAH(firestoreData.startBalanceUAH ?? null);
          setStartBalanceUSD(firestoreData.startBalanceUSD ?? null);
          setStartBalanceEUR(firestoreData.startBalanceEUR ?? null);
          
          if (firestoreData.selectedCurrencies) {
            setSelectedCurrencies(validateSelectedCurrencies(firestoreData.selectedCurrencies));
          }
          if (firestoreData.exchangeRates) {
            const hasNewStructure = Object.keys(firestoreData.exchangeRates).some(key => 
              key.includes('_') && typeof firestoreData.exchangeRates![key] === 'object' && (firestoreData.exchangeRates![key] as any).buy !== undefined
            );
            
            if (hasNewStructure) {
              setExchangeRates(firestoreData.exchangeRates);
              const uahUsdPair = firestoreData.exchangeRates['UAH_USD'];
              if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
                setUsdRate((uahUsdPair as any).buy);
              } else {
                setUsdRate(firestoreData.usdRate ?? 41.5);
              }
              const uahEurPair = firestoreData.exchangeRates['UAH_EUR'];
              if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
                setEurRate((uahEurPair as any).buy);
              } else {
                setEurRate(firestoreData.eurRate ?? 45);
              }
            } else {
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
                // @ts-ignore
                const rateVal = typeof rate === 'number' ? rate : (rate.buy || 1); 

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

          if (firestoreData.budgets) {
            // Спочатку встановлюємо всі бюджети з Firestore
            // Зберігаємо budgets в ref для використання в інших місцях
            const budgetsToSet = firestoreData.budgets;
            console.log('📦 Завантажено бюджетів з Firestore:', Object.keys(budgetsToSet).length, Object.keys(budgetsToSet));
            loadedBudgetsRef.current = budgetsToSet;
            setBudgets(budgetsToSet);
            
            // Встановлюємо activeBudgetId з Firestore, якщо він є
            if (firestoreData.activeBudgetId && budgetsToSet[firestoreData.activeBudgetId]) {
              setActiveBudgetId(firestoreData.activeBudgetId);
            }
            
            try {
              const savedBudgetId = getCookie(ACTIVE_BUDGET_COOKIE_KEY);
              if (savedBudgetId && firestoreData.budgets[savedBudgetId]) {
                const savedBudget = firestoreData.budgets[savedBudgetId];
                setActiveBudgetId(savedBudgetId);
                
                if (savedBudget.selectedCurrencies) {
                  setSelectedCurrencies(validateSelectedCurrencies(savedBudget.selectedCurrencies));
                }
                
                if (savedBudget.exchangeRates) {
                  const hasNewStructure = Object.keys(savedBudget.exchangeRates).some(key => 
                    key.includes('_') && typeof savedBudget.exchangeRates![key] === 'object' && (savedBudget.exchangeRates![key] as any).buy !== undefined
                  );
                  if (hasNewStructure) {
                    setExchangeRates(savedBudget.exchangeRates);
                    const uahUsdPair = savedBudget.exchangeRates['UAH_USD'];
                    if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
                      setUsdRate((uahUsdPair as any).buy);
                    } else {
                      setUsdRate(savedBudget.usdRate ?? 41.5);
                    }
                    const uahEurPair = savedBudget.exchangeRates['UAH_EUR'];
                    if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
                      setEurRate((uahEurPair as any).buy);
                    } else {
                      setEurRate(savedBudget.eurRate ?? 45);
                    }
                  } else {
                    setExchangeRates(savedBudget.exchangeRates);
                    // @ts-ignore
                    if (savedBudget.exchangeRates['USD']) {
                      // @ts-ignore
                      setUsdRate(savedBudget.exchangeRates['USD']);
                    } else {
                      setUsdRate(savedBudget.usdRate ?? 41.5);
                    }
                    // @ts-ignore
                    if (savedBudget.exchangeRates['EUR']) {
                      // @ts-ignore
                      setEurRate(savedBudget.exchangeRates['EUR']);
                    } else {
                      setEurRate(savedBudget.eurRate ?? 45);
                    }
                  }
                } else {
                  setUsdRate(savedBudget.usdRate ?? 41.5);
                  setEurRate(savedBudget.eurRate ?? 45);
                }
                
                setStartBalanceUAH(savedBudget.startBalanceUAH ?? null);
                setStartBalanceUSD(savedBudget.startBalanceUSD ?? null);
                setStartBalanceEUR(savedBudget.startBalanceEUR ?? null);
                
                // Оновлюємо тільки конкретний бюджет, зберігаючи всі інші
                // Використовуємо loadedBudgetsRef як джерело правди, щоб зберегти всі бюджети
                setBudgets((prevBudgets: Budgets) => {
                  // Якщо prevBudgets порожній або не містить всіх бюджетів, використовуємо loadedBudgetsRef
                  const baseBudgets = (prevBudgets && Object.keys(prevBudgets).length > 0) 
                    ? prevBudgets 
                    : (loadedBudgetsRef.current || firestoreData.budgets || {});
                  return {
                    ...baseBudgets,
                    [savedBudgetId]: {
                      ...savedBudget,
                      startBalances: savedBudget.startBalances || {}
                    }
                  };
                });
                
                setDays(normalizeDaysArray(savedBudget.days || []));
              } else if (firestoreData.activeBudgetId && firestoreData.budgets[firestoreData.activeBudgetId]) {
                // Якщо немає cookie, але є activeBudgetId з Firestore, завантажуємо його дані
                const activeBudget = firestoreData.budgets[firestoreData.activeBudgetId];
                setActiveBudgetId(firestoreData.activeBudgetId);
                
                if (activeBudget.selectedCurrencies) {
                  setSelectedCurrencies(validateSelectedCurrencies(activeBudget.selectedCurrencies));
                }
                
                if (activeBudget.exchangeRates) {
                  const hasNewStructure = Object.keys(activeBudget.exchangeRates).some(key => 
                    key.includes('_') && typeof activeBudget.exchangeRates![key] === 'object' && (activeBudget.exchangeRates![key] as any).buy !== undefined
                  );
                  if (hasNewStructure) {
                    setExchangeRates(activeBudget.exchangeRates);
                    const uahUsdPair = activeBudget.exchangeRates['UAH_USD'];
                    if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
                      setUsdRate((uahUsdPair as any).buy);
                    } else {
                      setUsdRate(activeBudget.usdRate ?? 41.5);
                    }
                    const uahEurPair = activeBudget.exchangeRates['UAH_EUR'];
                    if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
                      setEurRate((uahEurPair as any).buy);
                    } else {
                      setEurRate(activeBudget.eurRate ?? 45);
                    }
                  } else {
                    setExchangeRates(activeBudget.exchangeRates);
                     // @ts-ignore
                    if (activeBudget.exchangeRates['USD']) {
                       // @ts-ignore
                      setUsdRate(activeBudget.exchangeRates['USD']);
                    } else {
                      setUsdRate(activeBudget.usdRate ?? 41.5);
                    }
                     // @ts-ignore
                    if (activeBudget.exchangeRates['EUR']) {
                       // @ts-ignore
                      setEurRate(activeBudget.exchangeRates['EUR']);
                    } else {
                      setEurRate(activeBudget.eurRate ?? 45);
                    }
                  }
                } else {
                  setUsdRate(activeBudget.usdRate ?? 41.5);
                  setEurRate(activeBudget.eurRate ?? 45);
                }
                
                setStartBalanceUAH(activeBudget.startBalanceUAH ?? null);
                setStartBalanceUSD(activeBudget.startBalanceUSD ?? null);
                setStartBalanceEUR(activeBudget.startBalanceEUR ?? null);
                
                if (activeBudget.days) {
                  setDays(normalizeDaysArray(activeBudget.days));
                }
              } else {
                // Якщо немає ні cookie, ні activeBudgetId, беремо перший доступний бюджет
                const budgetKeys = Object.keys(firestoreData.budgets);
                if (budgetKeys.length > 0) {
                  const firstBudgetId = budgetKeys[0];
                  const firstBudget = firestoreData.budgets[firstBudgetId];
                  setActiveBudgetId(firstBudgetId);
                  
                  if (firstBudget.selectedCurrencies) {
                    setSelectedCurrencies(validateSelectedCurrencies(firstBudget.selectedCurrencies));
                  }
                  
                  if (firstBudget.exchangeRates) {
                    const hasNewStructure = Object.keys(firstBudget.exchangeRates).some(key => 
                      key.includes('_') && typeof firstBudget.exchangeRates![key] === 'object' && (firstBudget.exchangeRates![key] as any).buy !== undefined
                    );
                    if (hasNewStructure) {
                      setExchangeRates(firstBudget.exchangeRates);
                      const uahUsdPair = firstBudget.exchangeRates['UAH_USD'];
                      if (uahUsdPair && typeof uahUsdPair === 'object' && (uahUsdPair as any).buy) {
                        setUsdRate((uahUsdPair as any).buy);
                      } else {
                        setUsdRate(firstBudget.usdRate ?? 41.5);
                      }
                      const uahEurPair = firstBudget.exchangeRates['UAH_EUR'];
                      if (uahEurPair && typeof uahEurPair === 'object' && (uahEurPair as any).buy) {
                        setEurRate((uahEurPair as any).buy);
                      } else {
                        setEurRate(firstBudget.eurRate ?? 45);
                      }
                    } else {
                      setExchangeRates(firstBudget.exchangeRates);
                      // @ts-ignore
                      if (firstBudget.exchangeRates['USD']) {
                        // @ts-ignore
                        setUsdRate(firstBudget.exchangeRates['USD']);
                      } else {
                        setUsdRate(firstBudget.usdRate ?? 41.5);
                      }
                      // @ts-ignore
                      if (firstBudget.exchangeRates['EUR']) {
                        // @ts-ignore
                        setEurRate(firstBudget.exchangeRates['EUR']);
                      } else {
                        setEurRate(firstBudget.eurRate ?? 45);
                      }
                    }
                  } else {
                    setUsdRate(firstBudget.usdRate ?? 41.5);
                    setEurRate(firstBudget.eurRate ?? 45);
                  }
                  
                  setStartBalanceUAH(firstBudget.startBalanceUAH ?? null);
                  setStartBalanceUSD(firstBudget.startBalanceUSD ?? null);
                  setStartBalanceEUR(firstBudget.startBalanceEUR ?? null);
                  
                  if (firstBudget.days) {
                    setDays(normalizeDaysArray(firstBudget.days));
                  }
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
            
            // Встановлюємо activeBudgetId з localStorage
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

  // Синхронізація початкових балансів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      // Використовуємо loadedBudgetsRef як fallback, щоб зберегти всі бюджети
      // prevBudgets має завжди мати значення після початкового завантаження
      // Об'єднуємо prevBudgets та loadedBudgetsRef, щоб гарантувати що всі бюджети збережені
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      // Створюємо safePrev, об'єднуючи всі бюджети
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };

      const updatedStartBalances = { ...(existingBudget.startBalances || {}) };
      selectedCurrencies.forEach(code => {
        if (code === 'UAH') {
          updatedStartBalances[code] = startBalanceUAH;
        } else if (code === 'USD') {
          updatedStartBalances[code] = startBalanceUSD;
        } else if (code === 'EUR') {
          updatedStartBalances[code] = startBalanceEUR;
        } else {
          if (updatedStartBalances[code] === undefined) {
            updatedStartBalances[code] = null;
          }
        }
      });

      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          startBalanceUAH,
          startBalanceUSD,
          startBalanceEUR,
          startBalances: updatedStartBalances,
          selectedCurrencies
        }
      };
    });
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, selectedCurrencies, activeBudgetId, isInitialLoad, setBudgets]);

  // Синхронізація курсів валют у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      // Використовуємо loadedBudgetsRef як fallback, щоб зберегти всі бюджети
      // Об'єднуємо prevBudgets та loadedBudgetsRef, щоб гарантувати що всі бюджети збережені
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      // Створюємо safePrev, об'єднуючи всі бюджети
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };

      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          usdRate,
          eurRate,
          exchangeRates
        }
      };
    });
  }, [usdRate, eurRate, exchangeRates, activeBudgetId, isInitialLoad, setBudgets]);

  // Синхронізація днів у активний бюджет
  useEffect(() => {
    if (isInitialLoad) return;
    
    const currentId = activeBudgetId || 'default';

    setBudgets((prevBudgets: Budgets) => {
      // Використовуємо loadedBudgetsRef як fallback, щоб зберегти всі бюджети
      // Об'єднуємо prevBudgets та loadedBudgetsRef, щоб гарантувати що всі бюджети збережені
      const prevKeys = prevBudgets ? Object.keys(prevBudgets) : [];
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      const allKeys = Array.from(new Set([...prevKeys, ...refKeys]));
      
      // Створюємо safePrev, об'єднуючи всі бюджети
      const safePrev: Budgets = {};
      allKeys.forEach(key => {
        safePrev[key] = prevBudgets?.[key] || loadedBudgetsRef.current?.[key] || { name: 'Основний' };
      });
      
      const existingBudget = safePrev[currentId] || {
        name: 'Основний'
      };

      return {
        ...safePrev,
        [currentId]: {
          ...existingBudget,
          days
        }
      };
    });
  }, [days, activeBudgetId, isInitialLoad, setBudgets]);

  // Оновлення ref з останніми значеннями для fallback
  useEffect(() => {
    latestDataRef.current = {
      startBalanceUAH,
      startBalanceUSD,
      startBalanceEUR,
      usdRate,
      eurRate,
      selectedCurrencies,
      exchangeRates,
      days
    };
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, selectedCurrencies, exchangeRates, days]);

  // Оновлення loadedBudgetsRef при зміні budgets (після початкового завантаження)
  useEffect(() => {
    if (budgets && Object.keys(budgets).length > 0) {
      // Оновлюємо ref тільки якщо кількість бюджетів збільшилася або не зменшилася
      // Це гарантує, що ми не втратимо бюджети при синхронізації
      const currentKeys = Object.keys(budgets);
      const refKeys = loadedBudgetsRef.current ? Object.keys(loadedBudgetsRef.current) : [];
      
      // Оновлюємо ref якщо:
      // 1. Це початкове завантаження (isInitialLoad = false означає що завантаження завершено)
      // 2. Кількість бюджетів збільшилася
      // 3. Або budgets містить всі ключі з ref
      if (isInitialLoad === false && (currentKeys.length >= refKeys.length || 
          refKeys.every(key => currentKeys.includes(key)))) {
        loadedBudgetsRef.current = budgets;
        console.log('📦 Оновлено loadedBudgetsRef:', currentKeys.length, 'бюджетів');
      }
    }
  }, [budgets, isInitialLoad]);

  // Автоматичне збереження в localStorage при зміні даних
  useEffect(() => {
    if (isInitialLoad || authLoading) return;

    saveToLocalStorage(
      startBalanceUAH, 
      startBalanceUSD, 
      startBalanceEUR, 
      usdRate, 
      eurRate, 
      days, 
      selectedCurrencies, 
      exchangeRates,
      budgets,
      activeBudgetId
    );
    
    if (!user) {
      setSyncStatus(getSyncStatusText('local'));
    }
  }, [startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, days, selectedCurrencies, exchangeRates, budgets, activeBudgetId, isInitialLoad, authLoading, user, setSyncStatus, getSyncStatusText]);

  // Автоматичне збереження в Firestore при зміні budgets
  useEffect(() => {
    if (isInitialLoad || authLoading || !user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSyncStatus(getSyncStatusText('syncing'));
    saveTimeoutRef.current = setTimeout(() => {
      const latestData = latestDataRef.current;
      const safeBudgets = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: 'Основний',
          startBalanceUAH: latestData.startBalanceUAH,
          startBalanceUSD: latestData.startBalanceUSD,
          startBalanceEUR: latestData.startBalanceEUR,
          usdRate: latestData.usdRate,
          eurRate: latestData.eurRate,
          selectedCurrencies: latestData.selectedCurrencies,
          exchangeRates: latestData.exchangeRates,
          days: latestData.days
        }
      };
      const currentId = activeBudgetId || 'default';
      saveToFirestore(user, safeBudgets, currentId, false, setSyncStatus, getSyncStatusText);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [budgets, activeBudgetId, user, isInitialLoad, authLoading, setSyncStatus, getSyncStatusText]);

  return {
    user,
    authLoading
  };
}

