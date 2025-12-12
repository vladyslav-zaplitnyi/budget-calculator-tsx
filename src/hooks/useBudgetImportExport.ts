import { useRef, useCallback, ChangeEvent, useState } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { validateSelectedCurrencies } from '../utils/currencies';
import { Budgets, Day, Transaction, Budget } from '../types';
import { validateDay, validateTransaction } from '../schemas/budgetSchema';
import { handleError } from '../utils/errorHandler';
import { translate } from '../i18n/config';

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
      const budgetStartBalances = activeBudget?.startBalances || {};

      // Формуємо мапу startBalances з усіх вибраних валют
      const exportStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        exportStartBalances[code] = budgetStartBalances[code] ?? null;
      });

      const settingsToSave: Record<string, unknown> = {
        startBalances: exportStartBalances,
        selectedCurrencies: [...selectedCurrencies],
        exchangeRates: { ...exchangeRates }
      };

      const dataToSave = {
        savedAt: new Date().toISOString(),
        displayCurrency: displayCurrency,
        displayCurrencyIndex: displayCurrencyIndex,
        budgetName: activeBudget?.name || translate('budget.main'),
        budgetDate: activeBudget?.budgetDate || {
          year: new Date().getFullYear(),
          month: new Date().getMonth()
        },
        settings: settingsToSave,
        days: days.map((day, index) => ({
          day: day.day || (index + 1),
          transactions: Array.isArray(day.transactions) ? day.transactions : []
        }))
      };

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const filename = `budget_${year}-${month}-${day}_${hours}-${minutes}.json`;

      const jsonString = JSON.stringify(dataToSave, null, 2);

      // Детекція браузера для кращого UX
      const isFirefox = typeof navigator !== 'undefined' && 
        (navigator.userAgent.includes('Firefox') || navigator.userAgent.includes('Gecko'));
      
      // Якщо браузер підтримує File System Access API – даємо користувачу вибрати місце збереження
      // Перевіряємо наявність API більш надійним способом
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
                description: 'JSON файли',
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

          setSaveMessage(`${translate('errors.fileSaved')}: ${filename}`);
          setTimeout(() => setSaveMessage(''), 3000);
          return;
        } catch (error: unknown) {
          // Якщо користувач просто закрив діалог – не вважаємо це помилкою
          if (error instanceof DOMException && error.name === 'AbortError') {
            setSaveMessage(translate('importExport.saveCancelled'));
            setTimeout(() => setSaveMessage(''), 3000);
            return;
          }
          // Якщо помилка безпеки або інша – використовуємо fallback
          console.warn('File System Access API помилка, fallback до стандартного завантаження:', error);
          // Продовжуємо до fallback
        }
      }

      // Fallback для браузерів без File System Access API (Firefox, Safari тощо)
      // Використовуємо стандартний спосіб завантаження
      const blob = new Blob([jsonString], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      // Додаємо атрибут для кращої сумісності
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Для Firefox показуємо додаткову інформацію
      if (isFirefox) {
        setSaveMessage(translate('importExport.fileSavedInfo', { filename }));
      } else {
        setSaveMessage(`${translate('errors.fileSaved')}: ${filename}`);
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

          if (validatedTransactions.length > 5) {
            const warningMessage = translate('transaction.maxTransactions', { 
              day: i, 
              count: validatedTransactions.length 
            });
            console.warn(warningMessage);
            setLoadMessage(warningMessage);
            validatedTransactions.splice(5);
          }

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

      normalizedDays = normalizeDaysArray(newDays);
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
    setBudgets((prevBudgets: Budgets) => {
      const safePrev = prevBudgets || {};
      
      const updatedBudget: Budget = {
        name: budgetName,
        startBalances,
        selectedCurrencies: loadedCurrencies,
        exchangeRates: loadedExchangeRates,
        days: normalizedDays || days,
        displayCurrency: data.displayCurrency || loadedCurrencies[0] || 'UAH',
        displayCurrencyIndex: data.displayCurrencyIndex ?? 0,
        budgetDate
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

  // Функція для прямого імпорту (для неавторизованих користувачів)
  const applyImportDataDirectly = useCallback((data: any, targetBudgetId: string, budgetName: string, fileName: string) => {
    try {
      setIsLoading(true);
      applyImportData(data, targetBudgetId, budgetName);
      setLoadMessage(`✅ Імпортовано з файлу: ${fileName}`);
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
  }, [user, activeBudgetId, budgets, applyImportDataDirectly, setIsLoading, setLoadMessage]);

  // Функція для вирішення конфлікту імпорту (тільки для авторизованих користувачів)
  const resolveImport = useCallback((action: 'new' | 'overwrite') => {
    if (!pendingImport) return;

    try {
      const data = pendingImport;
      const currentBudgets = budgets || {};
      const count = Object.keys(currentBudgets).length;

      if (action === 'new') {
        // Перевірка ліміту
        if (count >= 3) {
          setLoadMessage('❌ Ліміт 3 бюджети досягнуто! Видаліть один, щоб додати новий.');
          setTimeout(() => setLoadMessage(''), 4000);
          setShowImportModal(false);
          setPendingImport(null);
          return;
        }

        // Створюємо нову назву з датою збереження
        const savedDate = data.savedAt ? new Date(data.savedAt) : new Date();
        const budgetName = data.budgetName || data.settings?.name || translate('budget.main');
        const dateStr = savedDate.toLocaleString();
        const newBudgetName = `${budgetName} (від ${dateStr})`;

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
        setLoadMessage(`✅ Створено новий бюджет: ${newBudgetName}`);
      } else {
        // Перезаписуємо поточний бюджет
        const currentId = activeBudgetId || 'default';
        const currentBudgetName = currentBudgets[currentId]?.name || translate('budget.main');
        applyImportData(data, currentId, currentBudgetName);
        setLoadMessage(`✅ Оновлено бюджет: ${currentBudgetName}`);
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
  }, [pendingImport, budgets, activeBudgetId, applyImportData, setActiveBudgetId, setLoadMessage]);

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

