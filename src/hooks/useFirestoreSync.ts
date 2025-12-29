import { useEffect, useState } from 'react';
import { loadFromFirestore, loadFromLocalStorage, saveToFirestore, createEmptyDefaultBudget, saveToLocalStorage } from '../utils/storageHelpers';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES, BASE_CURRENCY } from '../utils/currencies';
import { ACTIVE_BUDGET_COOKIE_KEY } from '../utils/constants';
import { getCookie } from '../utils/cookieHelpers';
import { BudgetStateWithSync } from '../contexts/BudgetContext';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates, Budget } from '../types';
import { getBuyRate, hasPairStructure } from '../utils/typeGuards';
import { WrongPasswordError } from '../utils/encryption';
import { translate } from '../i18n/config';
import { roundToDecimals } from '../utils/rounding';

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
    setBudgetDate
  } = budgetState;

  // Стан для модального вікна введення пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  
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
    
    setDays(normalizeDaysArray(budget.days || []));
  };

  // Допоміжна функція для ініціалізації порожнього бюджету
  const initializeEmptyBudget = () => {
    // Створюємо дефолтний бюджет з локалізованою назвою
    const emptyBudget = createEmptyDefaultBudget();
    const defaultBudget = emptyBudget['default'];
    
    setSelectedCurrencies(DEFAULT_CURRENCIES);
    setExchangeRates({});
    setDays(defaultBudget.days); // Використовуємо дні з дефолтного бюджету
    setBudgets(emptyBudget);
    loadedBudgetsRef.current = emptyBudget;
    setActiveBudgetId('default');
    setSyncStatus(getSyncStatusText('local'));
    
    // 🔒 FETCH-FIRST: Новий користувач без даних, дозволяємо запис
    setIsDataLoaded(true);
    console.log('✅ Новий користувач, створено порожній бюджет. Запис розблоковано.');
  };

  // Функція для обробки даних з Firestore
  const processFirestoreData = (firestoreData: any) => {
    if (!firestoreData) return;

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
    
    if (firestoreData.days && Array.isArray(firestoreData.days) && firestoreData.days.length === 31) {
      setDays(normalizeDaysArray(firestoreData.days));
    } else if (firestoreData.days) {
      setDays(normalizeDaysArray(firestoreData.days));
    }

    // Обробляємо бюджети
    if (firestoreData.budgets) {
      const budgetsToSet = firestoreData.budgets;
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

  // Завантаження даних з Firestore при вході користувача
  // Очищаємо loadedBudgetsRef коли користувач виходить з акаунту
  useEffect(() => {
    if (!user && !authLoading) {
      loadedBudgetsRef.current = null;
      // 🔒 FETCH-FIRST: Скидаємо блокування при виході (буде встановлено при наступному вході)
      setIsDataLoaded(false);
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
            // 🔒 ЗАПОБІЖНИК: Встановлюємо прапорець, що в хмарі є зашифровані дані
            setIsRemoteDataEncrypted(true);
            console.warn('🔒 Виявлено зашифровані дані в Firestore. Запис заблоковано до введення пароля.');
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
            // Новий користувач - перевіряємо чи є дані в localStorage для збереження
            console.log('📦 Новий користувач - перевірка localStorage');
            
            // Очищаємо cookies від попереднього користувача
            document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            
            // ВАЖЛИВО: Даємо невелику затримку, щоб дані встигли зберегтися після імпорту
            // Якщо дані не знайдені відразу, перевіряємо ще раз через 100мс
            let hasLocalStorageData = localStorage.getItem('budgetTrackerData');
            if (!hasLocalStorageData) {
              console.log('📦 Дані не знайдені відразу, чекаємо 100мс...');
              await new Promise(resolve => setTimeout(resolve, 100));
              hasLocalStorageData = localStorage.getItem('budgetTrackerData');
            }
            
            console.log('📦 Перевірка localStorage:', hasLocalStorageData ? 'Є дані' : 'Немає даних');
            
            // Додаткова діагностика: виводимо вміст localStorage
            if (hasLocalStorageData) {
              try {
                const parsed = JSON.parse(hasLocalStorageData);
                console.log('📦 Вміст localStorage:', {
                  hasBudgets: !!parsed.budgets,
                  budgetsCount: parsed.budgets ? Object.keys(parsed.budgets).length : 0,
                  activeBudgetId: parsed.activeBudgetId,
                  budgetKeys: parsed.budgets ? Object.keys(parsed.budgets) : []
                });
              } catch (e) {
                console.error('⚠️ Помилка парсингу localStorage:', e);
              }
            }
            
            if (hasLocalStorageData) {
              // Є дані в localStorage - спробуємо завантажити їх
              const localData = loadFromLocalStorage();
              console.log('📦 Результат loadFromLocalStorage:', localData ? `Знайдено ${Object.keys(localData.budgets || {}).length} бюджетів` : 'null');
              
              if (localData && localData.budgets && Object.keys(localData.budgets).length > 0) {
                // Є валідні дані в localStorage - зберігаємо їх як "Основний"/"Main" бюджет з id 'default'
                console.log('📦 Збереження поточного бюджету з localStorage як Основний/Main');
                
                const currentBudgets = localData.budgets;
                const currentActiveId = localData.activeBudgetId || 'default';
                const currentBudget = currentBudgets[currentActiveId];
                
                if (currentBudget) {
                  // Оновлюємо назву бюджету залежно від мови та використовуємо id 'default'
                  const budgetName = translate('budget.defaultBudgetName');
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
                        // 🔒 FETCH-FIRST: Дані нового користувача збережені та завантажені, розблоковуємо запис
                        setIsDataLoaded(true);
                        console.log('✅ Дані нового користувача збережені в Firestore. Запис розблоковано.');
                      }
                    });
                  }).catch((error) => {
                    console.error('Помилка при збереженні бюджету:', error);
                    initializeEmptyBudget();
                  });
                } else {
                  // Немає поточного бюджету - спробуємо знайти будь-який бюджет
                  console.log('⚠️ Активний бюджет не знайдено, шукаємо будь-який бюджет...');
                  const budgetKeys = Object.keys(currentBudgets);
                  if (budgetKeys.length > 0) {
                    const firstBudgetKey = budgetKeys[0];
                    const firstBudget = currentBudgets[firstBudgetKey];
                    console.log(`📦 Використовуємо перший знайдений бюджет: ${firstBudgetKey}`);
                    
                    if (firstBudget) {
                      const budgetName = translate('budget.defaultBudgetName');
                      const budgetsToSave: Budgets = {
                        'default': {
                          ...firstBudget,
                          name: budgetName,
                          startBalances: firstBudget.startBalances || {},
                          selectedCurrencies: firstBudget.selectedCurrencies || DEFAULT_CURRENCIES,
                          exchangeRates: firstBudget.exchangeRates || {},
                          days: firstBudget.days || [],
                          displayCurrency: firstBudget.displayCurrency || 'RON',
                          displayCurrencyIndex: firstBudget.displayCurrencyIndex ?? 0
                        }
                      };
                      
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
                        loadFromFirestore(user, null).then((savedData) => {
                          if (savedData && !('isEncrypted' in savedData && 'needsPassword' in savedData)) {
                            processFirestoreData(savedData);
                            // 🔒 FETCH-FIRST: Дані нового користувача збережені та завантажені, розблоковуємо запис
                            setIsDataLoaded(true);
                            console.log('✅ Дані нового користувача збережені в Firestore. Запис розблоковано.');
                          }
                        });
                      }).catch((error) => {
                        console.error('Помилка при збереженні бюджету:', error);
                        initializeEmptyBudget();
                      });
                    } else {
                      initializeEmptyBudget();
                    }
                  } else {
                    // Немає поточного бюджету - створюємо порожній
                    initializeEmptyBudget();
                  }
                }
              } else {
                // Є budgetTrackerData, але структура не валідна - спробуємо відновити дані
                console.log('📦 Дані в localStorage є, але структура не валідна. Спробуємо відновити...');
                try {
                  const parsedData = JSON.parse(hasLocalStorageData);
                  
                  // Перевіряємо чи є дані в старій структурі (без budgets)
                  // або в budgets, але без валідного активного бюджету
                  let recoveredData: any = null;
                  
                  // Спочатку перевіряємо чи є budgets з даними
                  if (parsedData.budgets && typeof parsedData.budgets === 'object') {
                    // Знаходимо перший бюджет з даними
                    const budgetKeys = Object.keys(parsedData.budgets);
                    for (const key of budgetKeys) {
                      const budget = parsedData.budgets[key];
                      if (budget && (budget.days || budget.startBalances || budget.selectedCurrencies)) {
                        recoveredData = budget;
                        break;
                      }
                    }
                  }
                  
                  // Якщо не знайшли в budgets, перевіряємо старі поля на верхньому рівні
                  if (!recoveredData && (parsedData.days || parsedData.startBalances || parsedData.selectedCurrencies)) {
                    recoveredData = parsedData;
                  }
                  
                  if (recoveredData) {
                    // Спробуємо створити бюджет з наявних даних
                    const budgetName = translate('budget.defaultBudgetName');
                    const recoveredBudget: Budget = {
                      name: budgetName,
                      startBalances: recoveredData.startBalances || {},
                      selectedCurrencies: validateSelectedCurrencies(recoveredData.selectedCurrencies || DEFAULT_CURRENCIES),
                      exchangeRates: recoveredData.exchangeRates || {},
                      days: recoveredData.days ? normalizeDaysArray(recoveredData.days) : [],
                      displayCurrency: recoveredData.displayCurrency || 'RON',
                      displayCurrencyIndex: recoveredData.displayCurrencyIndex ?? 0
                    };
                    
                    const budgetsToSave: Budgets = {
                      'default': recoveredBudget
                    };
                    
                    // Зберігаємо в Firestore
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
                          // 🔒 FETCH-FIRST: Відновлені дані збережені та завантажені, розблоковуємо запис
                          setIsDataLoaded(true);
                          console.log('✅ Відновлені дані збережені в Firestore. Запис розблоковано.');
                        }
                      });
                    }).catch((error) => {
                      console.error('Помилка при збереженні відновленого бюджету:', error);
                      initializeEmptyBudget();
                    });
                  } else {
                    // Немає даних для відновлення - створюємо порожній бюджет
                    console.log('📦 Немає даних для відновлення, створюємо порожній бюджет');
                    initializeEmptyBudget();
                  }
                } catch (parseError) {
                  console.error('Помилка при парсингу даних з localStorage:', parseError);
                  // Якщо не вдалося відновити - створюємо порожній бюджет
                  initializeEmptyBudget();
                }
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
              setPasswordError(translate('encryption.wrongPassword'));
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
          
          // ПАРОЛЬ ПРАВИЛЬНИЙ: тепер можна встановити пароль, очистити localStorage та закрити модальне вікно
          setPasswordError(undefined); // Очищаємо помилку при успішному вході
          setEncryptionPassword(password);
          setShowPasswordModal(false);
          
          // ВАЖЛИВО: Очищаємо localStorage перед завантаженням даних з БД,
          // щоб уникнути конфлікту між локальними даними та даними з БД
          try {
            localStorage.removeItem('budgetTrackerData');
            console.log('🔑 Очищено localStorage перед завантаженням з БД');
          } catch (error) {
            console.error('Помилка при очищенні localStorage:', error);
          }
          
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
  };

  return {
    showPasswordModal,
    passwordError,
    handlePasswordSubmit,
    handlePasswordCancel,
    isRemoteDataEncrypted,
    isDataLoaded
  };
}


