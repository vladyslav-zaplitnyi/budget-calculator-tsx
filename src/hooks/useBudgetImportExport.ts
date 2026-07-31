import { useRef, useCallback, ChangeEvent, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, Day, Transaction, Budget } from '../types';
import { validateDay, validateTransaction } from '../schemas/budgetSchema';
import { handleError } from '../utils/errorHandler';
import i18n, { translate } from '../i18n/config';
import { sanitizeFileNamePart } from '../utils/fileNameSanitizer';
import {
  buildSingleMonthExportJson,
  buildFullRollingExportJson,
  parseBudgetImportJson,
  applySingleMonthImportToBudget,
  budgetsFromFullRollingPayload,
  type SingleMonthExportPayload,
  type FullRollingExportPayload
} from '../utils/budgetImportExport';
import {
  MAX_TRANSACTIONS_PER_MONTH,
  getRemainingMonthCapacity
} from '../utils/transactionLimits';

/** Must match `BUDGET_VIEW_MODE_STORAGE_KEY` in BudgetTracker. */
const BUDGET_VIEW_MODE_STORAGE_KEY = 'budget_tracker_budget_view_mode';

function formatLocaleDateTime(date: Date): string {
  return date.toLocaleString(i18n.language === 'uk' ? 'uk-UA' : 'en-US');
}

const MONTH_PLAN_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const BUDGET_VIEW_MODE_IMPORT_EVENT = 'budget-view-mode-from-import';

type ParsedMonthlyPlans =
  | { fromFile: false }
  | { fromFile: true; plans: Record<string, Transaction[]> };

function parseMonthlyPlansFromImport(data: Record<string, unknown>): ParsedMonthlyPlans {
  if (!Object.prototype.hasOwnProperty.call(data, 'monthlyPlans')) {
    return { fromFile: false };
  }
  const raw = data.monthlyPlans;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { fromFile: true, plans: {} };
  }
  const plans: Record<string, Transaction[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!MONTH_PLAN_KEY_RE.test(key)) continue;
    if (!Array.isArray(value)) continue;
    const txs: Transaction[] = [];
    for (const t of value) {
      try {
        txs.push(validateTransaction(t));
      } catch {
        console.warn(`⚠️ Пропущено невалідну транзакцію в плані місяця ${key}`);
      }
    }
    if (txs.length > 0) {
      plans[key] = txs;
    }
  }
  return { fromFile: true, plans };
}

function applyBudgetViewModeFromImport(data: Record<string, unknown>) {
  const mode = data.budgetViewMode;
  if (mode !== 'days' && mode !== 'months') return;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BUDGET_VIEW_MODE_STORAGE_KEY, mode);
      window.dispatchEvent(new CustomEvent(BUDGET_VIEW_MODE_IMPORT_EVENT, { detail: mode }));
    }
  } catch {
    // ignore
  }
}

/**
 * Hook для імпорту та експорту бюджету в JSON формат
 */
export function useBudgetImportExport() {
  const context = useBudgetContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    selectedCurrencies,
    exchangeRates,
    activeBudgetId,
    budgets,
    days,
    setSelectedCurrencies,
    setExchangeRates,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    setIsLoading,
    displayCurrency,
    displayCurrencyIndex,
    setDisplayCurrency,
    setDisplayCurrencyIndex,
    setActiveBudgetId,
    user
  } = context;

  // Стан для розумного імпорту (тільки для авторизованих користувачів)
  const [pendingImport, setPendingImport] = useState<any | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const handleExportToJsonFile = useCallback(async () => {
    try {
      const activeBudget = budgets && budgets[activeBudgetId || 'default'];
      if (!activeBudget) {
        setSaveMessage(translate('errors.exportError'));
        setTimeout(() => setSaveMessage(''), 3000);
        return;
      }

      let budgetViewModeExport: 'days' | 'months' = 'days';
      try {
        if (typeof window !== 'undefined') {
          const stored = window.localStorage.getItem(BUDGET_VIEW_MODE_STORAGE_KEY);
          if (stored === 'days' || stored === 'months') {
            budgetViewModeExport = stored;
          }
        }
      } catch {
        // ignore
      }

      const budgetStartBalances = activeBudget?.startBalances || {};
      const exportStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach((code) => {
        exportStartBalances[code] = budgetStartBalances[code] ?? null;
      });

      const jsonString =
        budgetViewModeExport === 'months'
          ? buildFullRollingExportJson({
              budgets: budgets || {},
              activeBudgetId: activeBudgetId || 'default'
            })
          : buildSingleMonthExportJson({
              budget: activeBudget,
              days,
              startBalances: exportStartBalances,
              selectedCurrencies,
              exchangeRates,
              displayCurrency,
              displayCurrencyIndex
            });

      const now = new Date();
      const y = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const rawBudgetName =
        (activeBudget?.name && String(activeBudget.name).trim()) ||
        (activeBudgetId === 'default' ? '1' : activeBudgetId) ||
        '1';
      const safeBudgetName = sanitizeFileNamePart(rawBudgetName, '1');
      const bd = activeBudget.budgetDate || {
        year: now.getFullYear(),
        month: now.getMonth()
      };
      const monthTag = `${bd.year}-${String(bd.month + 1).padStart(2, '0')}`;
      const filename =
        budgetViewModeExport === 'months'
          ? `budget_${safeBudgetName}_all-months_${y}-${mo}-${d}_${hours}-${minutes}.json`
          : `budget_${safeBudgetName}_month-${monthTag}_${y}-${mo}-${d}_${hours}-${minutes}.json`;

      const isFirefox =
        typeof navigator !== 'undefined' &&
        (navigator.userAgent.includes('Firefox') || navigator.userAgent.includes('Gecko'));

      const supportsFileSystemAccess =
        typeof window !== 'undefined' &&
        'showSaveFilePicker' in window &&
        typeof (window as any).showSaveFilePicker === 'function';

      if (supportsFileSystemAccess) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: translate('importExport.jsonFileType'),
                accept: {
                  'application/json': ['.json']
                }
              }
            ],
            excludeAcceptAllOption: false
          });

          const writable = await fileHandle.createWritable();
          await writable.write(jsonString);
          await writable.close();

          setSaveMessage(translate('importExport.fileSavedWithFilename', { filename }));
          setTimeout(() => setSaveMessage(''), 3000);
          return;
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setSaveMessage(translate('importExport.saveCancelled'));
            setTimeout(() => setSaveMessage(''), 3000);
            return;
          }
          console.warn('File System Access API помилка, fallback до стандартного завантаження:', error);
        }
      }

      const blob = new Blob([jsonString], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (isFirefox) {
        setSaveMessage(translate('importExport.fileSavedInfo', { filename }));
      } else {
        setSaveMessage(translate('importExport.fileSavedWithFilename', { filename }));
      }
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (error) {
      console.error('Помилка при експорті JSON:', error);
      setSaveMessage(translate('errors.exportError'));
      setTimeout(() => setSaveMessage(''), 3000);
    }
  }, [
    budgets,
    activeBudgetId,
    selectedCurrencies,
    exchangeRates,
    days,
    displayCurrency,
    displayCurrencyIndex,
    setSaveMessage
  ]);

  const handleImportFromJsonFile = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Допоміжна функція для застосування імпортованих даних
  const applyImportData = useCallback((data: any, targetBudgetId: string, budgetName: string) => {
    // Обробка валют
    let loadedCurrencies = ['UAH', 'USD', 'EUR'];
    if (data.settings?.selectedCurrencies && Array.isArray(data.settings.selectedCurrencies)) {
      loadedCurrencies = validateSelectedCurrencies(data.settings.selectedCurrencies);
    }

    const loadedExchangeRates = data.settings?.exchangeRates && typeof data.settings.exchangeRates === 'object'
      ? data.settings.exchangeRates
      : {};

    // Завантажуємо startBalances ПЕРЕД встановленням валют
    const startBalancesFromSettings: Record<string, number | null> = {};
    if (data.settings?.startBalances && typeof data.settings.startBalances === 'object') {
      Object.entries(data.settings.startBalances).forEach(([currencyCode, balance]) => {
        if (typeof balance === 'number') {
          startBalancesFromSettings[currencyCode] = balance;
        } else if (balance === null || balance === '') {
          startBalancesFromSettings[currencyCode] = null;
        } else {
          startBalancesFromSettings[currencyCode] = null;
        }
      });
    }

    // Обробка budgetDate
    let budgetDate: { year: number; month: number };
    if (data.budgetDate && typeof data.budgetDate === 'object' && 
        typeof data.budgetDate.year === 'number' && 
        typeof data.budgetDate.month === 'number') {
      budgetDate = {
        year: data.budgetDate.year,
        month: data.budgetDate.month
      };
    } else if (data.savedAt && typeof data.savedAt === 'string') {
      // Якщо budgetDate не вказано, але є savedAt, використовуємо його
      const savedDate = new Date(data.savedAt);
      budgetDate = {
        year: savedDate.getFullYear(),
        month: savedDate.getMonth()
      };
    } else {
      // Використовуємо поточну дату як fallback
      const now = new Date();
      budgetDate = {
        year: now.getFullYear(),
        month: now.getMonth()
      };
    }

    // Обробка днів
    let normalizedDays: Day[] | null = null;
    if (data.days && Array.isArray(data.days)) {
      interface LoadedDay {
        day?: number;
        description?: string;
        transactions?: Transaction[];
      }

      const loadedDays = (data.days as LoadedDay[]).map((d) => ({
        day: d.day || 0,
        description: String(d.description || '').trim(),
        transactions: Array.isArray(d.transactions) ? d.transactions : []
      }));

      const newDays: Day[] = [];
      let monthTransactionTotal = 0;
      let droppedTransactions = 0;
      for (let i = 1; i <= 31; i++) {
        const loadedDay = loadedDays.find((d) => d.day === i);
        if (loadedDay) {
          const validatedTransactions: Transaction[] = [];
          if (Array.isArray(loadedDay.transactions)) {
            for (const transaction of loadedDay.transactions) {
              try {
                validatedTransactions.push(validateTransaction(transaction));
              } catch (error) {
                handleError(
                  error instanceof Error ? error : new Error(String(error)),
                  {
                    context: 'useBudgetImportExport',
                    action: 'applyImportData',
                    details: `Помилка валідації транзакції в день ${i}`
                  }
                );
                console.warn(`⚠️ Транзакція в день ${i} не валідна і буде пропущена`);
              }
            }
          }

          const capacity = getRemainingMonthCapacity(monthTransactionTotal);
          if (validatedTransactions.length > capacity) {
            droppedTransactions += validatedTransactions.length - capacity;
            validatedTransactions.splice(capacity);
          }
          monthTransactionTotal += validatedTransactions.length;

          const dayData: Day = {
            day: loadedDay.day || i,
            description: String(loadedDay.description || '').trim(),
            transactions: validatedTransactions
          };

          try {
            newDays.push(validateDay(dayData));
          } catch (error) {
            handleError(
              error instanceof Error ? error : new Error(String(error)),
              {
                context: 'useBudgetImportExport',
                action: 'applyImportData',
                details: `Помилка валідації дня ${i}`
              }
            );
            newDays.push({
              day: i,
              transactions: [],
              description: ''
            });
            console.warn(`⚠️ День ${i} не валідний, використано значення за замовчуванням`);
          }
        } else {
          newDays.push({
            day: i,
            transactions: [],
            description: ''
          });
        }
      }

      if (droppedTransactions > 0) {
        const warningMessage = translate('transactionLimit.importTruncated', {
          count: droppedTransactions,
          max: MAX_TRANSACTIONS_PER_MONTH
        });
        console.warn(warningMessage);
        setLoadMessage(warningMessage);
      }

      normalizedDays = normalizeDaysArray(newDays, budgetDate.year, budgetDate.month);
    }

    // ВАЖЛИВО: Спочатку оновлюємо бюджет з правильними startBalances,
    // щоб useBudgetStateSync не перезаписав їх при зміні selectedCurrencies або днів
    const startBalances: Record<string, number | null> = {};
    loadedCurrencies.forEach(currencyCode => {
      if (startBalancesFromSettings[currencyCode] !== undefined) {
        startBalances[currencyCode] = startBalancesFromSettings[currencyCode];
      } else {
        startBalances[currencyCode] = null;
      }
    });

    // Оновлюємо або створюємо бюджет ПЕРЕД встановленням валют та днів
    const importRecord = data as Record<string, unknown>;
    const parsedMonthlyPlans = parseMonthlyPlansFromImport(importRecord);

    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      const existingForTarget = safePrev[targetBudgetId];

      const nextMonthlyPlans = parsedMonthlyPlans.fromFile
        ? parsedMonthlyPlans.plans
        : (existingForTarget?.monthlyPlans || {});

      let plannerStartYear = existingForTarget?.plannerStartYear;
      let plannerStartMonth = existingForTarget?.plannerStartMonth;
      if (
        typeof importRecord.plannerStartYear === 'number' &&
        Number.isInteger(importRecord.plannerStartYear) &&
        typeof importRecord.plannerStartMonth === 'number' &&
        Number.isInteger(importRecord.plannerStartMonth) &&
        importRecord.plannerStartMonth >= 0 &&
        importRecord.plannerStartMonth <= 11
      ) {
        plannerStartYear = importRecord.plannerStartYear;
        plannerStartMonth = importRecord.plannerStartMonth;
      }

      let plannerExpandedMonth: string | null | undefined = existingForTarget?.plannerExpandedMonth;
      if (Object.prototype.hasOwnProperty.call(importRecord, 'plannerExpandedMonth')) {
        const ex = importRecord.plannerExpandedMonth;
        if (ex === null) {
          plannerExpandedMonth = null;
        } else if (typeof ex === 'string' && MONTH_PLAN_KEY_RE.test(ex)) {
          plannerExpandedMonth = ex;
        }
      }

      const updatedBudget: Budget = {
        name: budgetName,
        startBalances,
        selectedCurrencies: loadedCurrencies,
        exchangeRates: loadedExchangeRates,
        days: normalizedDays || days,
        displayCurrency: data.displayCurrency || loadedCurrencies[0] || 'UAH',
        displayCurrencyIndex: data.displayCurrencyIndex ?? 0,
        budgetDate,
        monthlyPlans: nextMonthlyPlans,
        ...(plannerStartYear != null && plannerStartMonth != null
          ? { plannerStartYear, plannerStartMonth }
          : {}),
        ...(plannerExpandedMonth !== undefined
          ? { plannerExpandedMonth }
          : {})
      };

      const updatedBudgets = {
        ...safePrev,
        [targetBudgetId]: updatedBudget
      };

      console.log('💾 Збереження імпортованих даних в localStorage:', {
        targetBudgetId,
        budgetName: updatedBudget.name,
        hasDays: (updatedBudget.days || []).length > 0,
        hasStartBalances: Object.keys(updatedBudget.startBalances || {}).length > 0,
        currencies: updatedBudget.selectedCurrencies
      });
      
      // ВАЖЛИВО: Зберігаємо синхронно ПЕРЕД поверненням, щоб дані гарантовано збереглися
      saveToLocalStorage(updatedBudgets, targetBudgetId);
      
      // Додаткова перевірка: переконуємося, що дані збереглися
      const verifySaved = localStorage.getItem('budgetTrackerData');
      if (verifySaved) {
        try {
          const parsed = JSON.parse(verifySaved);
          console.log('✅ Підтвердження збереження:', parsed.budgets ? `Знайдено ${Object.keys(parsed.budgets).length} бюджетів` : 'Немає budgets');
        } catch (e) {
          console.error('⚠️ Помилка перевірки збережених даних:', e);
        }
      } else {
        console.error('❌ Помилка: дані не збереглися в localStorage!');
      }
      
      return updatedBudgets;
    });

    // ВАЖЛИВО: Встановлюємо дні, валюти та курси ПІСЛЯ оновлення бюджету
    // Використовуємо setTimeout з більшою затримкою, щоб гарантувати, що setBudgets завершився
    // і budgets оновився перед викликом setDays/setSelectedCurrencies
    setTimeout(() => {
      // Встановлюємо дні
      if (normalizedDays) {
        setDays(normalizedDays);
      }

      // Відновлюємо displayCurrency та displayCurrencyIndex
      if (data.displayCurrency && typeof data.displayCurrency === 'string') {
        const currencyIndex = loadedCurrencies.indexOf(data.displayCurrency);
        if (currencyIndex !== -1) {
          setDisplayCurrency(data.displayCurrency);
          setDisplayCurrencyIndex(currencyIndex);
        } else {
          const savedIndex = typeof data.displayCurrencyIndex === 'number' 
            ? Math.min(data.displayCurrencyIndex, loadedCurrencies.length - 1)
            : 0;
          setDisplayCurrency(loadedCurrencies[savedIndex] || 'UAH');
          setDisplayCurrencyIndex(savedIndex);
        }
      }

      // Встановлюємо валюти ПІСЛЯ оновлення бюджету,
      // щоб useBudgetStateSync не перезаписав startBalances
      setSelectedCurrencies(loadedCurrencies);
      
      if (Object.keys(loadedExchangeRates).length > 0) {
        setExchangeRates(loadedExchangeRates);
      }

      applyBudgetViewModeFromImport(importRecord);
      
      // Додаткова перевірка: переконуємося, що дані все ще в localStorage
      setTimeout(() => {
        const finalCheck = localStorage.getItem('budgetTrackerData');
        if (finalCheck) {
          try {
            const parsed = JSON.parse(finalCheck);
            const budgetCount = parsed.budgets ? Object.keys(parsed.budgets).length : 0;
            console.log(`✅ Фінальна перевірка після імпорту: ${budgetCount} бюджетів в localStorage`);
          } catch (e) {
            console.error('⚠️ Помилка фінальної перевірки:', e);
          }
        } else {
          console.error('❌ КРИТИЧНО: Дані зникли з localStorage після імпорту!');
        }
      }, 200);
    }, 100);
  }, [days, setSelectedCurrencies, setExchangeRates, setBudgets, setDays, setLoadMessage, setDisplayCurrency, setDisplayCurrencyIndex]);

  const applyRollingFullPayload = useCallback(
    (payload: FullRollingExportPayload) => {
      const { budgets: nb, activeBudgetId: aid } = budgetsFromFullRollingPayload(payload);
      const active = nb[aid];
      const bd = active?.budgetDate;
      if (!active || !bd) return;
      setBudgets(nb);
      setActiveBudgetId(aid);
      saveToLocalStorage(nb, aid);
      setTimeout(() => {
        setSelectedCurrencies(validateSelectedCurrencies(active.selectedCurrencies || DEFAULT_CURRENCIES));
        setExchangeRates(active.exchangeRates || {});
        setDisplayCurrency(active.displayCurrency || 'RON');
        setDisplayCurrencyIndex(active.displayCurrencyIndex ?? 0);
        setDays(normalizeDaysArray(active.days || [], bd.year, bd.month));
      }, 100);
    },
    [
      setBudgets,
      setActiveBudgetId,
      setSelectedCurrencies,
      setExchangeRates,
      setDisplayCurrency,
      setDisplayCurrencyIndex,
      setDays
    ]
  );

  const applyRollingSinglePayload = useCallback(
    (payload: SingleMonthExportPayload, targetBudgetId: string) => {
      setBudgets((prev) => {
        const safePrev = prev || {};
        const base = safePrev[targetBudgetId];
        if (!base) return safePrev;
        const nextB = applySingleMonthImportToBudget(base, payload);
        const out = { ...safePrev, [targetBudgetId]: nextB };
        saveToLocalStorage(out, targetBudgetId);
        return out;
      });
      setTimeout(() => {
        setDays(
          normalizeDaysArray(payload.days, payload.budgetDate.year, payload.budgetDate.month)
        );
        if (payload.settings?.selectedCurrencies?.length) {
          setSelectedCurrencies(validateSelectedCurrencies(payload.settings.selectedCurrencies));
        }
        if (payload.settings?.exchangeRates && typeof payload.settings.exchangeRates === 'object') {
          setExchangeRates(payload.settings.exchangeRates);
        }
        if (payload.settings?.displayCurrency) {
          setDisplayCurrency(payload.settings.displayCurrency);
        }
        if (payload.settings?.displayCurrencyIndex !== undefined) {
          setDisplayCurrencyIndex(payload.settings.displayCurrencyIndex);
        }
      }, 100);
    },
    [
      setBudgets,
      setDays,
      setSelectedCurrencies,
      setExchangeRates,
      setDisplayCurrency,
      setDisplayCurrencyIndex
    ]
  );

  // Функція для прямого імпорту (для неавторизованих користувачів)
  const applyImportDataDirectly = useCallback((data: any, targetBudgetId: string, budgetName: string, fileName: string) => {
    try {
      setIsLoading(true);
      applyImportData(data, targetBudgetId, budgetName);
      setLoadMessage(translate('importExport.importedFromFile', { filename: fileName }));
      setTimeout(() => {
        setLoadMessage('');
        setIsLoading(false);
      }, 3000);
    } catch (err) {
      console.error('Помилка при імпорті:', err);
      setLoadMessage(translate('errors.importError'));
      setTimeout(() => setLoadMessage(''), 4000);
      setIsLoading(false);
    }
  }, [applyImportData, setIsLoading, setLoadMessage]);

  // Обробник вибору файлу для імпорту
  const handleJsonFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setLoadMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          setIsLoading(false);
          return;
        }
        
        const parsed = parseBudgetImportJson(text);

        if (parsed?.kind === 'rollingState') {
          console.log('📂 Rolling-state JSON:', file.name);
          if (user) {
            setPendingImport(parsed.data);
            setShowImportModal(true);
            setIsLoading(false);
          } else {
            applyRollingFullPayload(parsed.data);
            setLoadMessage(translate('importExport.importedFullStateFromFile', { filename: file.name }));
            setTimeout(() => {
              setLoadMessage('');
              setIsLoading(false);
            }, 3000);
          }
          return;
        }

        if (parsed?.kind === 'singleMonth') {
          console.log('📂 Single-month JSON:', file.name);
          if (user) {
            setPendingImport(parsed.data);
            setShowImportModal(true);
            setIsLoading(false);
          } else {
            const currentId = activeBudgetId || 'default';
            applyRollingSinglePayload(parsed.data, currentId);
            setLoadMessage(translate('importExport.importedMonthFromFile', { filename: file.name }));
            setTimeout(() => {
              setLoadMessage('');
              setIsLoading(false);
            }, 3000);
          }
          return;
        }

        const data = JSON.parse(text);

        console.log('📂 Завантажено дані з локального JSON-файлу:', file.name);

        // Якщо користувач авторизований - показуємо модальне вікно вибору
        if (user) {
          console.log('👤 Авторизований користувач: показуємо діалог вибору');
          setPendingImport(data);
          setShowImportModal(true);
          setIsLoading(false);
        } else {
          // Якщо НЕ авторизований - просто імпортуємо в поточний бюджет
          console.log('👤 Анонімний користувач: імпорт в поточний бюджет');
          const currentId = activeBudgetId || 'default';
          const currentBudget = budgets?.[currentId];
          const currentBudgetName = currentBudget?.name || translate('budget.main');
          applyImportDataDirectly(data, currentId, currentBudgetName, file.name);
        }
      } catch (err) {
        console.error('Помилка при читанні JSON-файлу:', err);
        setLoadMessage(translate('errors.importError'));
        setTimeout(() => setLoadMessage(''), 4000);
        setIsLoading(false);
      } finally {
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      console.error('Помилка читання файлу');
      setIsLoading(false);
      setLoadMessage(translate('errors.readError'));
      setTimeout(() => setLoadMessage(''), 4000);
      event.target.value = '';
    };

    reader.readAsText(file, 'utf-8');
  }, [
    user,
    activeBudgetId,
    budgets,
    applyImportDataDirectly,
    applyRollingFullPayload,
    applyRollingSinglePayload,
    setIsLoading,
    setLoadMessage
  ]);

  // Функція для вирішення конфлікту імпорту (тільки для авторизованих користувачів)
  const resolveImport = useCallback((action: 'new' | 'overwrite') => {
    if (!pendingImport) return;

    try {
      const data = pendingImport as Record<string, unknown> & {
        exportKind?: string;
        exportVersion?: number;
      };

      if (data.exportKind === 'rollingState' && data.exportVersion === 1) {
        applyRollingFullPayload(data as unknown as FullRollingExportPayload);
        setLoadMessage(translate('importExport.importedFullState'));
        setTimeout(() => setLoadMessage(''), 3000);
        setShowImportModal(false);
        setPendingImport(null);
        return;
      }

      if (data.exportKind === 'singleMonth' && data.exportVersion === 1) {
        const payload = data as unknown as SingleMonthExportPayload;
        const currentBudgets = budgets || {};
        if (action === 'new') {
          const count = Object.keys(currentBudgets).length;
          if (count >= 3) {
            setLoadMessage(translate('importExport.budgetLimitReached'));
            setTimeout(() => setLoadMessage(''), 4000);
            setShowImportModal(false);
            setPendingImport(null);
            return;
          }
          const savedDate = payload.savedAt ? new Date(payload.savedAt) : new Date();
          const budgetName = translate('importExport.importMonthBudgetName', {
            monthKey: payload.monthKey,
            date: formatLocaleDateTime(savedDate)
          });
          const baseId = `import-${payload.monthKey}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          let newId = baseId;
          let suffix = 1;
          while (currentBudgets[newId]) {
            newId = `${baseId}-${suffix++}`;
          }
          const template = currentBudgets[activeBudgetId || 'default'];
          const starter: Budget = template
            ? { ...template, name: budgetName, days: [], startBalances: {}, monthsByKey: {} }
            : ({
                name: budgetName,
                startBalances: {},
                selectedCurrencies: DEFAULT_CURRENCIES,
                exchangeRates: {},
                days: [],
                displayCurrency: 'RON',
                displayCurrencyIndex: 0,
                budgetDate: payload.budgetDate
              } as Budget);
          const nextB = applySingleMonthImportToBudget(starter, payload);
          setBudgets({ ...currentBudgets, [newId]: nextB });
          setActiveBudgetId(newId);
          saveToLocalStorage({ ...currentBudgets, [newId]: nextB }, newId);
          setTimeout(() => {
            setDays(
              normalizeDaysArray(payload.days, payload.budgetDate.year, payload.budgetDate.month)
            );
            if (payload.settings?.selectedCurrencies?.length) {
              setSelectedCurrencies(validateSelectedCurrencies(payload.settings.selectedCurrencies));
            }
            if (payload.settings?.exchangeRates && typeof payload.settings.exchangeRates === 'object') {
              setExchangeRates(payload.settings.exchangeRates);
            }
            if (payload.settings?.displayCurrency) setDisplayCurrency(payload.settings.displayCurrency);
            if (payload.settings?.displayCurrencyIndex !== undefined) {
              setDisplayCurrencyIndex(payload.settings.displayCurrencyIndex);
            }
          }, 100);
          setLoadMessage(translate('importExport.createdFromMonthImport', { budgetName }));
        } else {
          const currentId = activeBudgetId || 'default';
          applyRollingSinglePayload(payload, currentId);
          setLoadMessage(translate('importExport.updatedMonthInCurrentBudget'));
        }
        setTimeout(() => setLoadMessage(''), 3000);
        setShowImportModal(false);
        setPendingImport(null);
        return;
      }

      const currentBudgets = budgets || {};
      const count = Object.keys(currentBudgets).length;

      if (action === 'new') {
        // Перевірка ліміту
        if (count >= 3) {
          setLoadMessage(translate('importExport.budgetLimitReached'));
          setTimeout(() => setLoadMessage(''), 4000);
          setShowImportModal(false);
          setPendingImport(null);
          return;
        }

        // Створюємо нову назву з датою збереження
        const savedDate =
          typeof data.savedAt === 'string' ? new Date(data.savedAt) : new Date();
        const budgetName =
          (typeof data.budgetName === 'string' && data.budgetName) ||
          (typeof data.settings === 'object' &&
            data.settings &&
            typeof (data.settings as { name?: unknown }).name === 'string' &&
            (data.settings as { name: string }).name) ||
          translate('budget.main');
        const dateStr = formatLocaleDateTime(savedDate);
        const newBudgetName = translate('importExport.budgetNameWithDate', {
          name: budgetName,
          date: dateStr
        });

        // Генеруємо ID
        const baseId = newBudgetName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'budget';

        let newId = baseId;
        let suffix = 1;
        while (currentBudgets[newId]) {
          newId = `${baseId}-${suffix++}`;
        }

        // Обробка даних з файлу
        applyImportData(data, newId, newBudgetName);
        setActiveBudgetId(newId);
        setLoadMessage(translate('importExport.createdNewBudget', { budgetName: newBudgetName }));
      } else {
        // Перезаписуємо поточний бюджет
        const currentId = activeBudgetId || 'default';
        const currentBudgetName = currentBudgets[currentId]?.name || translate('budget.main');
        applyImportData(data, currentId, currentBudgetName);
        setLoadMessage(translate('importExport.updatedBudget', { budgetName: currentBudgetName }));
      }

      setTimeout(() => setLoadMessage(''), 3000);
    } catch (err) {
      console.error('Помилка при імпорті:', err);
      setLoadMessage(translate('errors.importError'));
      setTimeout(() => setLoadMessage(''), 4000);
    } finally {
      setShowImportModal(false);
      setPendingImport(null);
    }
  }, [
    pendingImport,
    budgets,
    activeBudgetId,
    applyImportData,
    applyRollingFullPayload,
    applyRollingSinglePayload,
    setActiveBudgetId,
    setBudgets,
    setDays,
    setSelectedCurrencies,
    setExchangeRates,
    setDisplayCurrency,
    setDisplayCurrencyIndex,
    setLoadMessage
  ]);

  // Функція для скасування імпорту
  const cancelImport = useCallback(() => {
    setShowImportModal(false);
    setPendingImport(null);
    setLoadMessage('');
  }, [setLoadMessage]);

  return {
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef,
    showImportModal,
    resolveImport,
    cancelImport,
    pendingImport
  };
}

