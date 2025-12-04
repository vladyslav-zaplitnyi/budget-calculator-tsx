import { useRef, useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { validateSelectedCurrencies } from '../utils/currencies';
import { Budgets, Day, Transaction } from '../types';
import { isExchangeRatePair } from '../utils/typeGuards';
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
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setSelectedCurrencies,
    setExchangeRates,
    setUsdRate,
    setEurRate,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    setIsLoading,
    baseCurrency
  } = context;

  const handleExportToJsonFile = useCallback(() => {
    try {
      const activeBudget = budgets && budgets[activeBudgetId || 'default'];
      const budgetStartBalances = activeBudget?.startBalances || {};
      
      // Формуємо мапу startBalances з усіх вибраних валют
      const exportStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        exportStartBalances[code] = budgetStartBalances[code] ?? null;
      });

      // Чисті налаштування без legacy-полів
      const settingsToSave: Record<string, unknown> = {
        startBalances: exportStartBalances,
        selectedCurrencies: [...selectedCurrencies],
        exchangeRates: { ...exchangeRates }
      };

      const dataToSave = {
        savedAt: new Date().toISOString(),
        baseCurrency: baseCurrency,
        budgetName: activeBudget?.name || 'Основний',
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

      const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSaveMessage(
        `${translate('errors.fileSaved')}: ${filename}`
      );
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Помилка при експорті JSON:', error);
      setSaveMessage(translate('errors.exportError'));
      setTimeout(() => setSaveMessage(''), 3000);
    }
  }, [budgets, activeBudgetId, selectedCurrencies, exchangeRates, days, baseCurrency, setSaveMessage]);

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

        if (data.settings) {
          let loadedCurrencies = ['UAH', 'USD', 'EUR'];
          if (data.settings.selectedCurrencies && Array.isArray(data.settings.selectedCurrencies)) {
            loadedCurrencies = validateSelectedCurrencies(data.settings.selectedCurrencies);
            setSelectedCurrencies(loadedCurrencies);
          }

          const loadedExchangeRates = data.settings.exchangeRates && typeof data.settings.exchangeRates === 'object'
            ? data.settings.exchangeRates
            : {};
          
          if (Object.keys(loadedExchangeRates).length > 0) {
            setExchangeRates(loadedExchangeRates);
            
            const uahUsdPair = loadedExchangeRates['UAH_USD'];
            if (isExchangeRatePair(uahUsdPair)) {
              setUsdRate(uahUsdPair.buy);
            } else {
              setUsdRate(data.settings.usdRate ?? 41.5);
            }
            
            const uahEurPair = loadedExchangeRates['UAH_EUR'];
            if (isExchangeRatePair(uahEurPair)) {
              setEurRate(uahEurPair.buy);
            } else {
              setEurRate(data.settings.eurRate ?? 45);
            }
          } else {
            setUsdRate(data.settings.usdRate ?? 41.5);
            setEurRate(data.settings.eurRate ?? 45);
          }

          // Підтримка нової структури startBalances та старої (для зворотної сумісності)
          const startBalancesFromSettings: Record<string, number | null> = {};
          
          // Спочатку перевіряємо нову структуру startBalances
          if (data.settings.startBalances && typeof data.settings.startBalances === 'object') {
            Object.entries(data.settings.startBalances).forEach(([currencyCode, balance]) => {
              if (typeof balance === 'number') {
                startBalancesFromSettings[currencyCode] = balance;
              } else if (balance === null || balance === '') {
                startBalancesFromSettings[currencyCode] = null;
              } else {
                // Ігноруємо невалідні значення
                startBalancesFromSettings[currencyCode] = null;
              }
            });
          }
          
          // Fallback на старі поля для зворотної сумісності
          if (data.settings.startBalanceUAH !== undefined) {
            startBalancesFromSettings['UAH'] = data.settings.startBalanceUAH;
          }
          if (data.settings.startBalanceUSD !== undefined) {
            startBalancesFromSettings['USD'] = data.settings.startBalanceUSD;
          }
          if (data.settings.startBalanceEUR !== undefined) {
            startBalancesFromSettings['EUR'] = data.settings.startBalanceEUR;
          }
          
          // Завантажуємо баланси для інших валют зі старих полів
          loadedCurrencies.forEach(currencyCode => {
            if (!['UAH', 'USD', 'EUR'].includes(currencyCode)) {
              const balanceKey = `startBalance${currencyCode}`;
              if (data.settings[balanceKey] !== undefined) {
                const balanceValue = data.settings[balanceKey];
                startBalancesFromSettings[currencyCode] = balanceValue === null || balanceValue === '' ? null : balanceValue;
              }
            }
          });
          
          // Оновлюємо глобальні стартові баланси для базових валют,
          // щоб useBudgetStateSync не перезаписував імпортовані значення старими
          if ('UAH' in startBalancesFromSettings) {
            setStartBalanceUAH(startBalancesFromSettings['UAH'] ?? null);
          }
          if ('USD' in startBalancesFromSettings) {
            setStartBalanceUSD(startBalancesFromSettings['USD'] ?? null);
          }
          if ('EUR' in startBalancesFromSettings) {
            setStartBalanceEUR(startBalancesFromSettings['EUR'] ?? null);
          }
          
          const currentId = activeBudgetId || 'default';
          
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const existingBudget = safePrev[currentId] || { name: 'Основний' };
            
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
                usdRate: data.settings.usdRate ?? existingBudget.usdRate ?? 41.5,
                eurRate: data.settings.eurRate ?? existingBudget.eurRate ?? 45
              }
            };
          });
        }

        let normalizedDays: Day[] | null = null;
        if (data.days && Array.isArray(data.days)) {
          const toNumber = (value: unknown): number => {
            if (value === '' || value === null || value === undefined) return 0;
            if (typeof value === 'number') return value;
            const num = parseFloat(String(value));
            return isNaN(num) ? 0 : num;
          };

          interface LoadedDay {
            day?: number;
            description?: string;
            transactions?: Transaction[];
            incomeUAH?: unknown;
            expenseUAH?: unknown;
            incomeUSD?: unknown;
            expenseUSD?: unknown;
            incomeEUR?: unknown;
            expenseEUR?: unknown;
          }

          const loadedDays = (data.days as LoadedDay[]).map((d) => ({
            day: d.day || 0,
            description: String(d.description || '').trim(),
            transactions: Array.isArray(d.transactions) ? d.transactions : [],
            incomeUAH: toNumber(d.incomeUAH),
            expenseUAH: toNumber(d.expenseUAH),
            incomeUSD: toNumber(d.incomeUSD),
            expenseUSD: toNumber(d.expenseUSD),
            incomeEUR: toNumber(d.incomeEUR),
            expenseEUR: toNumber(d.expenseEUR)
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

              // Мігруємо legacy-дані, якщо вони є
              const legacyDay = loadedDay as any;
              if (!validatedTransactions.length && (legacyDay.incomeUAH || legacyDay.expenseUAH || legacyDay.incomeUSD || legacyDay.expenseUSD || legacyDay.incomeEUR || legacyDay.expenseEUR)) {
                // Мігруємо legacy-поля в транзакції
                if (toNumber(legacyDay.incomeUAH) > 0) {
                  validatedTransactions.push({
                    id: `migrated-income-uah-${i}`,
                    type: 'income',
                    amount: toNumber(legacyDay.incomeUAH),
                    currency: 'UAH',
                    description: String(legacyDay.description || 'Міграція: Дохід UAH')
                  });
                }
                if (toNumber(legacyDay.expenseUAH) > 0) {
                  validatedTransactions.push({
                    id: `migrated-expense-uah-${i}`,
                    type: 'expense',
                    amount: toNumber(legacyDay.expenseUAH),
                    currency: 'UAH',
                    description: String(legacyDay.description || 'Міграція: Витрата UAH')
                  });
                }
                if (toNumber(legacyDay.incomeUSD) > 0) {
                  validatedTransactions.push({
                    id: `migrated-income-usd-${i}`,
                    type: 'income',
                    amount: toNumber(legacyDay.incomeUSD),
                    currency: 'USD',
                    description: String(legacyDay.description || 'Міграція: Дохід USD')
                  });
                }
                if (toNumber(legacyDay.expenseUSD) > 0) {
                  validatedTransactions.push({
                    id: `migrated-expense-usd-${i}`,
                    type: 'expense',
                    amount: toNumber(legacyDay.expenseUSD),
                    currency: 'USD',
                    description: String(legacyDay.description || 'Міграція: Витрата USD')
                  });
                }
                if (toNumber(legacyDay.incomeEUR) > 0) {
                  validatedTransactions.push({
                    id: `migrated-income-eur-${i}`,
                    type: 'income',
                    amount: toNumber(legacyDay.incomeEUR),
                    currency: 'EUR',
                    description: String(legacyDay.description || 'Міграція: Дохід EUR')
                  });
                }
                if (toNumber(legacyDay.expenseEUR) > 0) {
                  validatedTransactions.push({
                    id: `migrated-expense-eur-${i}`,
                    type: 'expense',
                    amount: toNumber(legacyDay.expenseEUR),
                    currency: 'EUR',
                    description: String(legacyDay.description || 'Міграція: Витрата EUR')
                  });
                }
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
          
          const finalSelectedCurrencies = data.settings?.selectedCurrencies 
            ? validateSelectedCurrencies(data.settings.selectedCurrencies)
            : selectedCurrencies;
          const finalExchangeRates = data.settings?.exchangeRates || exchangeRates;
          
          // Оновлюємо budgets з days та зберігаємо в localStorage
          const currentId = activeBudgetId || 'default';
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const updatedBudget = safePrev[currentId] || { name: 'Основний' };
            
            // Оновлюємо days в бюджеті
            const budgetWithDays = {
              ...updatedBudget,
              days: normalizedDays || days
            };
            
            const updatedBudgets = {
              ...safePrev,
              [currentId]: budgetWithDays
            };
            
            // Отримуємо startBalances з оновленого бюджету для збереження
            const finalStartBalances = budgetWithDays.startBalances || {};
            
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
  }, [activeBudgetId, selectedCurrencies, exchangeRates, days, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setBudgets, setDays, setIsLoading, setLoadMessage]);

  return {
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef
  };
}

