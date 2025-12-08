import { useRef, useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { validateSelectedCurrencies, DEFAULT_CURRENCIES } from '../utils/currencies';
import { Budgets, Day, Transaction } from '../types';
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
    setDisplayCurrencyIndex
  } = context;

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

  const handleJsonFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setLoadMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') return;
        
        const data = JSON.parse(text);

        console.log('📂 Імпорт даних з локального JSON-файлу:', file.name);

        // Обробка displayCurrency та displayCurrencyIndex (після завантаження selectedCurrencies)
        // Але спочатку завантажуємо selectedCurrencies, щоб перевірити валідність displayCurrency
        let loadedCurrencies = ['UAH', 'USD', 'EUR'];
        if (data.settings?.selectedCurrencies && Array.isArray(data.settings.selectedCurrencies)) {
          loadedCurrencies = validateSelectedCurrencies(data.settings.selectedCurrencies);
        }

        // Відновлюємо displayCurrency та displayCurrencyIndex
        if (data.displayCurrency && typeof data.displayCurrency === 'string') {
          // Перевіряємо, чи валюта є в завантажених валютах
          const currencyIndex = loadedCurrencies.indexOf(data.displayCurrency);
          if (currencyIndex !== -1) {
            setDisplayCurrency(data.displayCurrency);
            setDisplayCurrencyIndex(currencyIndex);
          } else {
            // Якщо валюта не знайдена, використовуємо індекс з даних або 0
            const savedIndex = typeof data.displayCurrencyIndex === 'number' 
              ? Math.min(data.displayCurrencyIndex, loadedCurrencies.length - 1)
              : 0;
            setDisplayCurrency(loadedCurrencies[savedIndex] || 'UAH');
            setDisplayCurrencyIndex(savedIndex);
          }
        }

        if (data.settings) {
          if (data.settings.selectedCurrencies && Array.isArray(data.settings.selectedCurrencies)) {
            setSelectedCurrencies(loadedCurrencies);
          }

          const loadedExchangeRates = data.settings.exchangeRates && typeof data.settings.exchangeRates === 'object'
            ? data.settings.exchangeRates
            : {};
          
          if (Object.keys(loadedExchangeRates).length > 0) {
            setExchangeRates(loadedExchangeRates);
          }

          // Завантажуємо startBalances
          const startBalancesFromSettings: Record<string, number | null> = {};
          
          if (data.settings.startBalances && typeof data.settings.startBalances === 'object') {
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
          
          const currentId = activeBudgetId || 'default';
          
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const existingBudget = safePrev[currentId] || {
              name: translate('budget.main'),
              startBalances: {},
              selectedCurrencies: DEFAULT_CURRENCIES,
              exchangeRates: {},
              days: []
            };
            
            const startBalances: Record<string, number | null> = { ...(existingBudget.startBalances || {}) };
            
            // Оновлюємо баланси з імпортованих даних
            loadedCurrencies.forEach(currencyCode => {
              if (startBalancesFromSettings[currencyCode] !== undefined) {
                startBalances[currencyCode] = startBalancesFromSettings[currencyCode];
              } else if (startBalances[currencyCode] === undefined) {
                startBalances[currencyCode] = null;
              }
            });
            
            return {
              ...safePrev,
              [currentId]: {
                ...existingBudget,
                startBalances,
                selectedCurrencies: loadedCurrencies,
                exchangeRates: loadedExchangeRates,
                days: existingBudget.days || []
              }
            };
          });
        }

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
              // Валідація транзакцій перед додаванням
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
                        action: 'handleJsonFileSelected',
                        details: `Помилка валідації транзакції в день ${i}`
                      }
                    );
                    // Пропускаємо невалідну транзакцію
                    console.warn(`⚠️ Транзакція в день ${i} не валідна і буде пропущена`);
                  }
                }
              }

              // Валідація: максимум 5 транзакцій на день
              if (validatedTransactions.length > 5) {
                const warningMessage = translate('transaction.maxTransactions', { 
                  day: i, 
                  count: validatedTransactions.length 
                });
                console.warn(warningMessage);
                setLoadMessage(warningMessage);
                // Обрізаємо до 5 транзакцій
                validatedTransactions.splice(5);
              }

              const dayData: Day = {
                day: loadedDay.day || i,
                description: String(loadedDay.description || '').trim(),
                transactions: validatedTransactions
              };

              // Валідація дня
              try {
                newDays.push(validateDay(dayData));
              } catch (error) {
                handleError(
                  error instanceof Error ? error : new Error(String(error)),
                  {
                    context: 'useBudgetImportExport',
                    action: 'handleJsonFileSelected',
                    details: `Помилка валідації дня ${i}`
                  }
                );
                // Додаємо день з базовими значеннями якщо валідація не пройшла
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
          setDays(normalizedDays);
        }

        setTimeout(() => {
          if (data.settings?.selectedCurrencies) {
            const validated = validateSelectedCurrencies(data.settings.selectedCurrencies);
            setSelectedCurrencies(validated);
          }
          
          if (data.settings?.exchangeRates) {
            setExchangeRates(data.settings.exchangeRates);
          }
          
          // Оновлюємо budgets з days та зберігаємо в localStorage
          const currentId = activeBudgetId || 'default';
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const updatedBudget = safePrev[currentId] || {
              name: translate('budget.main'),
              startBalances: {},
              selectedCurrencies: DEFAULT_CURRENCIES,
              exchangeRates: {},
              days: []
            };
            
            // Оновлюємо days в бюджеті
            const budgetWithDays = {
              ...updatedBudget,
              days: normalizedDays || days,
              startBalances: updatedBudget.startBalances || {},
              selectedCurrencies: updatedBudget.selectedCurrencies || DEFAULT_CURRENCIES,
              exchangeRates: updatedBudget.exchangeRates || {}
            };
            
            const updatedBudgets = {
              ...safePrev,
              [currentId]: budgetWithDays
            };
            
            // Зберігаємо в localStorage з budgets
            // Всі динамічні startBalances вже знаходяться всередині updatedBudgets
            saveToLocalStorage(updatedBudgets, currentId);
            
            return updatedBudgets;
          });
        }, 150);

        setLoadMessage(`✅ Імпортовано з файлу: ${file.name}`);
        setTimeout(() => setLoadMessage(''), 3000);
      } catch (err) {
        console.error('Помилка при читанні JSON-файлу:', err);
        setLoadMessage(translate('errors.importError'));
        setTimeout(() => setLoadMessage(''), 4000);
      } finally {
        setIsLoading(false);
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
  }, [activeBudgetId, days, setSelectedCurrencies, setExchangeRates, setBudgets, setDays, setIsLoading, setLoadMessage, setDisplayCurrency, setDisplayCurrencyIndex]);

  return {
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef
  };
}

