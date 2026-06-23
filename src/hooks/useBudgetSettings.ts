import { useCallback, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { createEmptyMonthDays } from '../utils/dayHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, ExchangeRates, Budget } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
import { saveToFirestore, saveToLocalStorage } from '../utils/storageHelpers';
import { calculateFinalBalances, calculateTotals, sanitizeNumberInput } from '../utils/calculations';
import { translate } from '../i18n/config';
import {
  monthKeyFromBudgetDate,
  trimOldestMonthKeys,
  buildEmptyMonthSlice,
  isViewingCurrentCalendarMonth,
  getDefaultOverviewWindow
} from '../utils/rollingMonthsBudget';
import { parseMonthKey } from '../utils/monthlyPlan';
import { applyBalanceWaterfallToBudget } from '../utils/balanceWaterfall';
import {
  applyMultiMonthBulkAdd,
  validateMultiMonthBulkAdd,
  MAX_TRANSACTIONS_PER_DAY
} from '../utils/multiMonthBulkTransactions';
import type { MultiMonthBulkTransactionDraft } from '../utils/multiMonthBulkTransactions';

export type ClearDaysScope = 'current-month' | 'all-months';

/**
 * Hook для управління налаштуваннями бюджету (валюти, курси, баланси)
 */
export function useBudgetSettings() {
  const context = useBudgetContext();
  const {
    // Поточні значення стану
    selectedCurrencies,
    exchangeRates,
    activeBudgetId,
    budgets,
    days,
    // Сетери стану
    setSelectedCurrencies,
    setExchangeRates,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    user,
    encryptionPassword,
    setEncryptionPassword,
    isEncrypted,
    setIsEncrypted,
    setSyncStatus,
    getSyncStatusText,
    currentBudgetBookId,
    isCurrentBookReadOnly
  } = context;

  // Стан для модальних вікон шифрування
  const [showEnableEncryptionModal, setShowEnableEncryptionModal] = useState(false);
  const [showDisableEncryptionModal, setShowDisableEncryptionModal] = useState(false);
  // Стан для модального вікна "Почати новий місяць"
  const [showStartNewMonthModal, setShowStartNewMonthModal] = useState(false);
  // Стан для AlertModal
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  // Стан для ConfirmModal
  const [showClearAllConfirmModal, setShowClearAllConfirmModal] = useState(false);
  const [showClearAllDaysConfirmModal, setShowClearAllDaysConfirmModal] = useState(false);
  const [clearDaysScope, setClearDaysScope] = useState<ClearDaysScope>('current-month');

  const handleClearAll = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    setShowClearAllConfirmModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handleConfirmClearAll = useCallback(() => {
    setShowClearAllConfirmModal(false);
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
      const currentId = activeBudgetId || 'default';
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId];
      const budgetDate = existingBudget?.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };
      const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
      
      const clearedStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(currencyCode => {
        clearedStartBalances[currencyCode] = null;
      });
      
      const clearedBudget = {
        ...existingBudget,
        startBalances: clearedStartBalances,
        days: emptyDays,
        selectedCurrencies: existingBudget.selectedCurrencies || selectedCurrencies || DEFAULT_CURRENCIES,
        exchangeRates: existingBudget.exchangeRates || {},
        displayCurrency: existingBudget.displayCurrency || 'RON',
        displayCurrencyIndex: existingBudget.displayCurrencyIndex ?? 0,
        budgetDate: existingBudget.budgetDate || budgetDate
      };

      const mk = monthKeyFromBudgetDate(budgetDate.year, budgetDate.month);
      const monthsByKey = trimOldestMonthKeys({
        ...(clearedBudget.monthsByKey || {}),
        [mk]: {
          days: emptyDays,
          startBalances: { ...clearedStartBalances }
        }
      });
      const afterWaterfall = applyBalanceWaterfallToBudget({
        ...clearedBudget,
        monthsByKey
      } as Budget);
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: { ...clearedBudget, ...afterWaterfall }
      };
      
      setBudgets(updatedBudgets);
      setDays(afterWaterfall.days);
      
      setLoadMessage('');
      setSaveMessage('');
      
      // Оновлюємо localStorage з очищеними даними
      saveToLocalStorage(updatedBudgets, currentId);
      
      console.log('✅ Всі поля очищено');
  }, [activeBudgetId, selectedCurrencies, budgets, setBudgets, setDays, setLoadMessage, setSaveMessage, user, isCurrentBookReadOnly]);

  const handleCancelClearAll = useCallback(() => {
    setShowClearAllConfirmModal(false);
  }, []);

  const handleClearAllDays = useCallback((scope: ClearDaysScope) => {
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    setClearDaysScope(scope);
    setShowClearAllDaysConfirmModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handleConfirmClearAllDays = useCallback(() => {
    setShowClearAllDaysConfirmModal(false);
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
      const currentId = activeBudgetId || 'default';
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      const budgetDate = existingBudget.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };

      let monthsByKey = { ...(existingBudget.monthsByKey || {}) };

      if (clearDaysScope === 'all-months') {
        const keysToClear = new Set<string>(Object.keys(monthsByKey));
        getDefaultOverviewWindow().forEach(({ key }) => keysToClear.add(key));

        keysToClear.forEach((key) => {
          const parsed = parseMonthKey(key);
          if (!parsed) return;
          monthsByKey[key] = {
            days: createEmptyMonthDays(parsed.year, parsed.month),
            startBalances: {
              ...(monthsByKey[key]?.startBalances || existingBudget.startBalances || {})
            }
          };
        });
      } else {
        const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);
        const mk = monthKeyFromBudgetDate(budgetDate.year, budgetDate.month);
        monthsByKey = {
          ...monthsByKey,
          [mk]: {
            days: emptyDays,
            startBalances: { ...(existingBudget.startBalances || {}) }
          }
        };
      }

      monthsByKey = trimOldestMonthKeys(monthsByKey);
      const emptyDays = createEmptyMonthDays(budgetDate.year, budgetDate.month);

      const clearedBudget = {
        ...existingBudget,
        days: emptyDays,
        monthsByKey,
        ...(clearDaysScope === 'all-months' ? { monthlyPlans: {} } : {})
      };

      const afterWaterfall = applyBalanceWaterfallToBudget(clearedBudget as Budget);
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: { ...clearedBudget, ...afterWaterfall }
      };
      
      setBudgets(updatedBudgets);
      setDays(afterWaterfall.days || emptyDays);
      
      saveToLocalStorage(updatedBudgets, currentId);
      
      console.log(
        clearDaysScope === 'all-months'
          ? '✅ Усі місяці очищено'
          : '✅ Дні обраного місяця очищено'
      );
  }, [activeBudgetId, budgets, setBudgets, setDays, user, isCurrentBookReadOnly, clearDaysScope]);

  const handleCancelClearAllDays = useCallback(() => {
    setShowClearAllDaysConfirmModal(false);
  }, []);

  const handleStartNewMonth = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    setShowStartNewMonthModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handleConfirmStartNewMonth = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setShowStartNewMonthModal(false);
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    const currentId = activeBudgetId || 'default';
    const safePrev = budgets || {};
    const existingBudget = safePrev[currentId] || {
      name: translate('budget.defaultBudgetName'),
      startBalances: {},
      selectedCurrencies: DEFAULT_CURRENCIES,
      exchangeRates: {},
      days: [],
      displayCurrency: 'RON',
      displayCurrencyIndex: 0
    };

    // Отримуємо поточну дату бюджету
    const currentBudgetDate = existingBudget.budgetDate || {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    };

    const oldKey = monthKeyFromBudgetDate(currentBudgetDate.year, currentBudgetDate.month);
    let monthsByKey = trimOldestMonthKeys({ ...(existingBudget.monthsByKey || {}) });
    monthsByKey[oldKey] = {
      days: days || [],
      startBalances: { ...(existingBudget.startBalances || {}) }
    };

    // Обчислюємо наступний місяць
    let newMonth = currentBudgetDate.month + 1;
    let newYear = currentBudgetDate.year;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear = newYear + 1;
    }

    const newBudgetDate = {
      year: newYear,
      month: newMonth
    };

    const newKey = monthKeyFromBudgetDate(newYear, newMonth);

    // Отримуємо поточні початкові баланси
    const currentStartBalances = existingBudget.startBalances || {};

    // Обчислюємо поточні фінальні баланси
    const totals = calculateTotals(days || [], selectedCurrencies);
    const finalBalances = calculateFinalBalances(
      days || [],
      selectedCurrencies,
      currentStartBalances,
      totals
    );

    // Створюємо нові початкові баланси з поточних фінальних балансів
    const newStartBalances: Record<string, number | null> = {};
    selectedCurrencies.forEach(currencyCode => {
      const finalBalanceKey = `finalBalance${currencyCode}`;
      const finalBalance = finalBalances[finalBalanceKey] || 0;
      newStartBalances[currencyCode] = finalBalance;
    });

    let nextSlice = monthsByKey[newKey];
    if (!nextSlice) {
      nextSlice = buildEmptyMonthSlice(newYear, newMonth, selectedCurrencies);
      nextSlice.startBalances = { ...newStartBalances };
    } else {
      nextSlice = {
        days: createEmptyMonthDays(newYear, newMonth),
        startBalances: { ...newStartBalances }
      };
    }

    monthsByKey = trimOldestMonthKeys({
      ...monthsByKey,
      [newKey]: nextSlice
    });

    const updatedBudgetRaw = {
      ...existingBudget,
      startBalances: nextSlice.startBalances,
      days: nextSlice.days,
      budgetDate: newBudgetDate,
      monthsByKey
    };
    const updatedBudget = applyBalanceWaterfallToBudget(updatedBudgetRaw as Budget);

    const updatedBudgets: Budgets = {
      ...safePrev,
      [currentId]: { ...existingBudget, ...updatedBudget }
    };

    setBudgets(updatedBudgets);
    setDays(nextSlice.days);

    // Оновлюємо localStorage
    saveToLocalStorage(updatedBudgets, currentId);

    // Якщо користувач авторизований, зберігаємо в Firestore
    if (user) {
      saveToFirestore(
        user,
        updatedBudgets,
        currentId,
        false,
        setSyncStatus,
        getSyncStatusText,
        encryptionPassword || undefined,
        setIsEncrypted,
        { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
      ).catch((error) => {
        console.error('Помилка при збереженні в Firestore:', error);
      });
    }

    setShowStartNewMonthModal(false);
    console.log('✅ Новий місяць розпочато:', newBudgetDate);
  }, [activeBudgetId, budgets, days, selectedCurrencies, setBudgets, setDays, user, encryptionPassword, setSyncStatus, getSyncStatusText, setIsEncrypted, isCurrentBookReadOnly, currentBudgetBookId]);

  const handleCancelStartNewMonth = useCallback(() => {
    setShowStartNewMonthModal(false);
  }, []);

  const handleCurrencyChange = useCallback((newCurrencies: string[]) => {
    if (user && isCurrentBookReadOnly) return;
    const validated = validateSelectedCurrencies(newCurrencies);
    setSelectedCurrencies(validated);

    // Оновлюємо budgets безпосередньо: встановлюємо selectedCurrencies та оновлюємо startBalances
    // ВАЖЛИВО: Зберігаємо всі курси обміну, навіть для валют, які тимчасово не вибрані
    const currentId = activeBudgetId || 'default';
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      // Оновлюємо startBalances: залишаємо тільки обрані валюти
      // ВАЖЛИВО: Беремо значення з існуючого бюджету, а не з окремих станів
      const updatedStartBalances: Record<string, number | null> = {};
      validated.forEach(code => {
        // Завжди беремо значення з існуючого бюджету
        updatedStartBalances[code] = existingBudget.startBalances?.[code] ?? null;
      });
      
      // ВАЖЛИВО: Зберігаємо всі курси з існуючого бюджету, не видаляємо їх
      // Це дозволяє зберігати курси для валют, які тимчасово не вибрані
      const preservedExchangeRates = existingBudget.exchangeRates || {};
      
      // Об'єднуємо збережені курси з поточними курсами зі стану
      // Це гарантує, що нові курси, введені користувачем, також зберігаються
      const mergedRates: ExchangeRates = {
        ...preservedExchangeRates,
        ...exchangeRates
      };
      
      const updatedBudget = {
        ...existingBudget,
        selectedCurrencies: validated,
        startBalances: updatedStartBalances,
        exchangeRates: mergedRates
      };
      
      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: updatedBudget
      };
      
      // Оновлюємо стан курсів, зберігаючи всі курси
      setExchangeRates(mergedRates);
      
      // Зберігаємо оновлені дані в localStorage
      saveToLocalStorage(updatedBudgets, currentId);
      
      return updatedBudgets;
    });
  }, [
    exchangeRates,
    activeBudgetId,
    setSelectedCurrencies,
    setExchangeRates,
    setBudgets,
    user,
    isCurrentBookReadOnly
  ]);

  const handleExchangeRateChange = useCallback((pairKey: string, type: string | undefined, rate: number) => {
    if (user && isCurrentBookReadOnly) return;
    setExchangeRates((prevRates: ExchangeRates) => {
      const newRates = { ...prevRates };
      
      if (pairKey && type && (type === 'buy' || type === 'sell')) {
        const currentValue = newRates[pairKey];
        if (!isExchangeRatePair(currentValue)) {
          // Створюємо пару з 0 для обох значень, якщо її ще немає
          newRates[pairKey] = { buy: 0, sell: 0 };
        }
        const pair = newRates[pairKey];
        if (isExchangeRatePair(pair)) {
          pair[type] = rate;
        }
      } else {
        const currencyCode = pairKey;
        newRates[currencyCode] = rate;
      }
      return newRates;
    });
  }, [setExchangeRates, user, isCurrentBookReadOnly]);

  const handleStartBalanceChange = useCallback((currencyCode: string, value: string) => {
    if (user && isCurrentBookReadOnly) return;
    const currentId = activeBudgetId || 'default';
    const existingForDate = budgets?.[currentId];
    const bd = existingForDate?.budgetDate || {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    };
    if (!isViewingCurrentCalendarMonth(bd.year, bd.month)) return;

    let numValue: number | null = null;
    if (value !== '' && value !== null && value !== undefined) {
      const parsed = parseFloat(sanitizeNumberInput(value));
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }

    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingBudget = safePrev[currentId] || {
        name: translate('budget.defaultBudgetName'),
        startBalances: {},
        selectedCurrencies: DEFAULT_CURRENCIES,
        exchangeRates: {},
        days: [],
        displayCurrency: 'RON',
        displayCurrencyIndex: 0
      };
      
      const startBalances = { ...(existingBudget.startBalances || {}) };
      startBalances[currencyCode] = numValue;

      const bd = existingBudget.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };
      const mk = monthKeyFromBudgetDate(bd.year, bd.month);
      const monthsByKey = trimOldestMonthKeys({
        ...(existingBudget.monthsByKey || {}),
        [mk]: {
          days: existingBudget.days || [],
          startBalances: { ...startBalances }
        }
      });

      const draft: Budget = {
        ...existingBudget,
        startBalances,
        monthsByKey,
        selectedCurrencies: existingBudget.selectedCurrencies || selectedCurrencies || DEFAULT_CURRENCIES,
        days: existingBudget.days || [],
        budgetDate: existingBudget.budgetDate,
        exchangeRates: existingBudget.exchangeRates || {}
      };
      const after = applyBalanceWaterfallToBudget(draft);

      return {
        ...safePrev,
        [currentId]: { ...existingBudget, ...after }
      };
    });
  }, [activeBudgetId, budgets, setBudgets, user, isCurrentBookReadOnly, selectedCurrencies]);

  // Обробники для шифрування
  const handleEnableEncryptionClick = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    setShowEnableEncryptionModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handleDisableEncryptionClick = useCallback(() => {
    if (user && isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }
    setShowDisableEncryptionModal(true);
  }, [user, isCurrentBookReadOnly]);

  const handleEnableEncryption = useCallback(async (password: string, confirmPassword: string) => {
    if (password !== confirmPassword) {
      setAlertMessage(translate('encryption.passwordsDoNotMatch') + '!');
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!password.trim()) {
      setAlertMessage(translate('encryption.passwordCannotBeEmpty'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!user) {
      setAlertMessage(translate('encryption.authenticationRequired'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    try {
      // Встановлюємо пароль
      setEncryptionPassword(password);
      
      // Зберігаємо дані з шифруванням
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: translate('budget.defaultBudgetName'),
          startBalances: {},
          selectedCurrencies: selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: exchangeRates || {},
          days: []
        }
      };
      
      await saveToFirestore(
        user,
        budgetsToSave,
        activeBudgetId || 'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        password,
        setIsEncrypted,
        { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
      );
      
      setShowEnableEncryptionModal(false);
      setAlertMessage(translate('encryption.enabled'));
      setAlertType('success');
      setShowAlertModal(true);
    } catch (error) {
      console.error('Помилка при увімкненні шифрування:', error);
      setAlertMessage(translate('encryption.enableError'));
      setAlertType('error');
      setShowAlertModal(true);
    }
  }, [user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText, isCurrentBookReadOnly, currentBudgetBookId]);

  const handleDisableEncryption = useCallback(async (password: string) => {
    if (!password.trim()) {
      setAlertMessage(translate('encryption.enterPassword'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    if (!user) {
      setAlertMessage(translate('encryption.authenticationRequired'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    if (isCurrentBookReadOnly) {
      setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
      setAlertType('warning');
      setShowAlertModal(true);
      return;
    }

    // Перевіряємо пароль, спробувавши розшифрувати дані
    if (encryptionPassword !== password) {
      setAlertMessage(translate('encryption.wrongPassword'));
      setAlertType('error');
      setShowAlertModal(true);
      return;
    }

    try {
      // Очищаємо пароль
      setEncryptionPassword(null);
      
      // Зберігаємо дані без шифрування
      const budgetsToSave = budgets && Object.keys(budgets).length > 0 ? budgets : {
        [activeBudgetId || 'default']: {
          name: translate('budget.defaultBudgetName'),
          startBalances: {},
          selectedCurrencies: selectedCurrencies || DEFAULT_CURRENCIES,
          exchangeRates: exchangeRates || {},
          days: []
        }
      };
      
      await saveToFirestore(
        user,
        budgetsToSave,
        activeBudgetId || 'default',
        false,
        setSyncStatus,
        getSyncStatusText,
        null,
        setIsEncrypted,
        { budgetBookId: currentBudgetBookId, isReadOnly: isCurrentBookReadOnly }
      );
      
      setShowDisableEncryptionModal(false);
      setAlertMessage(translate('encryption.disabled'));
      setAlertType('success');
      setShowAlertModal(true);
    } catch (error) {
      console.error('Помилка при вимкненні шифрування:', error);
      setAlertMessage(translate('encryption.disableError'));
      setAlertType('error');
      setShowAlertModal(true);
    }
  }, [user, budgets, activeBudgetId, selectedCurrencies, exchangeRates, encryptionPassword, setEncryptionPassword, setIsEncrypted, setSyncStatus, getSyncStatusText, isCurrentBookReadOnly, currentBudgetBookId]);

  const handleBulkAddTransactionsToMonths = useCallback(
    (draft: MultiMonthBulkTransactionDraft) => {
      if (user && isCurrentBookReadOnly) {
        setAlertMessage(translate('budgetBook.readOnlyActionBlocked'));
        setAlertType('warning');
        setShowAlertModal(true);
        return;
      }

      const currentId = activeBudgetId || 'default';
      const safePrev = budgets || {};
      const existingBudget = safePrev[currentId];
      if (!existingBudget) return;

      const budgetDate = existingBudget.budgetDate || {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      };
      const activeMonthKey = monthKeyFromBudgetDate(budgetDate.year, budgetDate.month);
      const monthsByKey = existingBudget.monthsByKey || {};

      const validation = validateMultiMonthBulkAdd(
        draft.monthKeys,
        draft.days,
        monthsByKey,
        activeMonthKey,
        days,
        MAX_TRANSACTIONS_PER_DAY
      );
      if (!validation.ok) return;

      const { monthsByKey: nextMonthsByKey, activeMonthDays } = applyMultiMonthBulkAdd(
        validation.plan,
        {
          type: draft.type,
          amount: draft.amount,
          currency: draft.currency,
          description: draft.description
        },
        monthsByKey,
        activeMonthKey,
        days,
        selectedCurrencies
      );

      const trimmedMonths = trimOldestMonthKeys(nextMonthsByKey);
      const nextDays = activeMonthDays ?? days;

      const draftBudget: Budget = {
        ...existingBudget,
        days: nextDays,
        monthsByKey: trimmedMonths
      };
      const afterWaterfall = applyBalanceWaterfallToBudget(draftBudget);

      const updatedBudgets: Budgets = {
        ...safePrev,
        [currentId]: { ...existingBudget, ...afterWaterfall }
      };

      setBudgets(updatedBudgets);
      setDays(afterWaterfall.days || nextDays);
      saveToLocalStorage(updatedBudgets, currentId);
    },
    [
      user,
      isCurrentBookReadOnly,
      activeBudgetId,
      budgets,
      days,
      selectedCurrencies,
      setBudgets,
      setDays
    ]
  );

  return {
    handleClearAll,
    handleClearAllDays,
    handleStartNewMonth,
    handleConfirmStartNewMonth,
    handleCancelStartNewMonth,
    showStartNewMonthModal,
    handleCurrencyChange,
    handleExchangeRateChange,
    handleStartBalanceChange,
    handleEnableEncryptionClick,
    handleDisableEncryptionClick,
    handleEnableEncryption,
    handleDisableEncryption,
    showEnableEncryptionModal,
    showDisableEncryptionModal,
    setShowEnableEncryptionModal,
    setShowDisableEncryptionModal,
    isEncrypted,
    showAlertModal,
    setShowAlertModal,
    alertMessage,
    alertType,
    showClearAllConfirmModal,
    setShowClearAllConfirmModal,
    handleConfirmClearAll,
    handleCancelClearAll,
    showClearAllDaysConfirmModal,
    setShowClearAllDaysConfirmModal,
    handleConfirmClearAllDays,
    handleCancelClearAllDays,
    clearDaysScope,
    handleBulkAddTransactionsToMonths
  };
}

