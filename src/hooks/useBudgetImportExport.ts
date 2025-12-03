import { useRef, useCallback, ChangeEvent } from 'react';
import { useBudgetContext } from '../contexts/BudgetContext';
import { normalizeDaysArray } from '../utils/dayHelpers';
import { saveToLocalStorage } from '../utils/storageHelpers';
import { validateSelectedCurrencies } from '../utils/currencies';
import { calculateTotals, calculateFinalBalances, convertCurrency } from '../utils/calculations';
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
    startBalanceUAH,
    startBalanceUSD,
    startBalanceEUR,
    usdRate,
    eurRate,
    activeBudgetId,
    budgets,
    days,
    setSelectedCurrencies,
    setExchangeRates,
    setUsdRate,
    setEurRate,
    setStartBalanceUAH,
    setStartBalanceUSD,
    setStartBalanceEUR,
    setBudgets,
    setDays,
    setSaveMessage,
    setLoadMessage,
    setIsLoading,
    baseCurrency
  } = context;

  const handleExportToJsonFile = useCallback(() => {
    try {
      const toNumber = (value: unknown): number => {
        if (value === '' || value === null || value === undefined) return 0;
        if (typeof value === 'number') return value;
        const num = parseFloat(String(value));
        return isNaN(num) ? 0 : num;
      };

      const activeBudget = budgets && budgets[activeBudgetId || 'default'];
      const budgetStartBalances = activeBudget?.startBalances || {};
      const exportStartBalances: Record<string, number | null> = {};
      selectedCurrencies.forEach(code => {
        if (code === 'UAH') {
          exportStartBalances[code] = startBalanceUAH;
        } else if (code === 'USD') {
          exportStartBalances[code] = startBalanceUSD;
        } else if (code === 'EUR') {
          exportStartBalances[code] = startBalanceEUR;
        } else {
          exportStartBalances[code] = budgetStartBalances[code] ?? null;
        }
      });

      const totals = calculateTotals(days, selectedCurrencies);
      const finalBalances = calculateFinalBalances(days, startBalanceUAH, startBalanceUSD, startBalanceEUR, selectedCurrencies, exportStartBalances);
      
      let totalInBaseCurrency = 0;
      selectedCurrencies.forEach(code => {
        const finalBalance = finalBalances[`finalBalance${code}`] || 0;
        if (code === baseCurrency) {
          totalInBaseCurrency += finalBalance;
        } else {
          totalInBaseCurrency += convertCurrency(finalBalance, code, baseCurrency, exchangeRates);
        }
      });

      const settingsToSave: Record<string, unknown> = {
        startBalanceUAH: startBalanceUAH !== null ? toNumber(startBalanceUAH) : null,
        startBalanceUSD: startBalanceUSD !== null ? toNumber(startBalanceUSD) : null,
        startBalanceEUR: startBalanceEUR !== null ? toNumber(startBalanceEUR) : null,
        usdRate: toNumber(usdRate),
        eurRate: toNumber(eurRate),
        selectedCurrencies: [...selectedCurrencies],
        exchangeRates: { ...exchangeRates }
      };

      selectedCurrencies.forEach(currencyCode => {
        const balanceKey = `startBalance${currencyCode}`;
        if (currencyCode === 'UAH') {
          settingsToSave[balanceKey] = startBalanceUAH !== null ? toNumber(startBalanceUAH) : null;
        } else if (currencyCode === 'USD') {
          settingsToSave[balanceKey] = startBalanceUSD !== null ? toNumber(startBalanceUSD) : null;
        } else if (currencyCode === 'EUR') {
          settingsToSave[balanceKey] = startBalanceEUR !== null ? toNumber(startBalanceEUR) : null;
        } else {
          const balance = exportStartBalances[currencyCode];
          settingsToSave[balanceKey] = balance !== null && balance !== undefined ? toNumber(balance) : null;
        }
      });

      if (exchangeRates['UAH_RON']) {
        const ronPair = exchangeRates['UAH_RON'];
        if (isExchangeRatePair(ronPair)) {
          settingsToSave.ronRate = ronPair.buy || ronPair.sell || null;
        } else if (typeof ronPair === 'number') {
          settingsToSave.ronRate = ronPair;
        }
      }
      if (exchangeRates['UAH_PLN']) {
        const plnPair = exchangeRates['UAH_PLN'];
        if (isExchangeRatePair(plnPair)) {
          settingsToSave.plnRate = plnPair.buy || plnPair.sell || null;
        } else if (typeof plnPair === 'number') {
          settingsToSave.plnRate = plnPair;
        }
      }

      const totalsToSave: Record<string, number> = {};
      selectedCurrencies.forEach(currencyCode => {
        totalsToSave[`totalIncome${currencyCode}`] = toNumber((totals[`totalIncome${currencyCode}`] || 0).toFixed(2));
        totalsToSave[`totalExpense${currencyCode}`] = toNumber((totals[`totalExpense${currencyCode}`] || 0).toFixed(2));
        totalsToSave[`finalBalance${currencyCode}`] = toNumber((finalBalances[`finalBalance${currencyCode}`] || 0).toFixed(2));
      });

      totalsToSave.totalIncomeUAH = toNumber((totals.totalIncomeUAH || 0).toFixed(2));
      totalsToSave.totalExpenseUAH = toNumber((totals.totalExpenseUAH || 0).toFixed(2));
      totalsToSave.totalIncomeUSD = toNumber((totals.totalIncomeUSD || 0).toFixed(2));
      totalsToSave.totalExpenseUSD = toNumber((totals.totalExpenseUSD || 0).toFixed(2));
      totalsToSave.totalIncomeEUR = toNumber((totals.totalIncomeEUR || 0).toFixed(2));
      totalsToSave.totalExpenseEUR = toNumber((totals.totalExpenseEUR || 0).toFixed(2));
      totalsToSave.finalBalanceUAH = toNumber((finalBalances.finalBalanceUAH || 0).toFixed(2));
      totalsToSave.finalBalanceUSD = toNumber((finalBalances.finalBalanceUSD || 0).toFixed(2));
      totalsToSave.finalBalanceEUR = toNumber((finalBalances.finalBalanceEUR || 0).toFixed(2));
      totalsToSave.totalInUAH = toNumber(totalInBaseCurrency.toFixed(2));

      const dataToSave = {
        savedAt: new Date().toISOString(),
        settings: settingsToSave,
        days: days.map((day, index) => ({
          day: day.day || (index + 1),
          description: String(day.description || '').trim(),
          transactions: Array.isArray(day.transactions) ? day.transactions : [],
          incomeUAH: toNumber(day.incomeUAH),
          expenseUAH: toNumber(day.expenseUAH),
          incomeUSD: toNumber(day.incomeUSD),
          expenseUSD: toNumber(day.expenseUSD),
          incomeEUR: toNumber(day.incomeEUR),
          expenseEUR: toNumber(day.expenseEUR)
        })),
        totals: totalsToSave
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
  }, [budgets, activeBudgetId, selectedCurrencies, exchangeRates, startBalanceUAH, startBalanceUSD, startBalanceEUR, usdRate, eurRate, days, baseCurrency, setSaveMessage]);

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

          setStartBalanceUAH(data.settings.startBalanceUAH ?? null);
          setStartBalanceUSD(data.settings.startBalanceUSD ?? null);
          setStartBalanceEUR(data.settings.startBalanceEUR ?? null);
          
          const currentId = activeBudgetId || 'default';
          
          setBudgets((prevBudgets: Budgets) => {
            const safePrev = prevBudgets || {};
            const existingBudget = safePrev[currentId] || { name: 'Основний' };
            
            const startBalances: Record<string, number | null> = {};
            
            loadedCurrencies.forEach(currencyCode => {
              const balanceKey = `startBalance${currencyCode}`;
              if (data.settings[balanceKey] !== undefined) {
                const balanceValue = data.settings[balanceKey];
                startBalances[currencyCode] = balanceValue === null || balanceValue === '' ? null : balanceValue;
              } else {
                startBalances[currencyCode] = existingBudget.startBalances?.[currencyCode] ?? null;
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

              const dayData: Day = {
                day: loadedDay.day || i,
                description: String(loadedDay.description || '').trim(),
                transactions: validatedTransactions,
                incomeUAH: toNumber(loadedDay.incomeUAH),
                expenseUAH: toNumber(loadedDay.expenseUAH),
                incomeUSD: toNumber(loadedDay.incomeUSD),
                expenseUSD: toNumber(loadedDay.expenseUSD),
                incomeEUR: toNumber(loadedDay.incomeEUR),
                expenseEUR: toNumber(loadedDay.expenseEUR)
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
                  description: '',
                  incomeUAH: 0,
                  expenseUAH: 0,
                  incomeUSD: 0,
                  expenseUSD: 0,
                  incomeEUR: 0,
                  expenseEUR: 0
                });
                console.warn(`⚠️ День ${i} не валідний, використано значення за замовчуванням`);
              }
            } else {
              newDays.push({
                day: i,
                transactions: [],
                description: '',
                incomeUAH: 0,
                expenseUAH: 0,
                incomeUSD: 0,
                expenseUSD: 0,
                incomeEUR: 0,
                expenseEUR: 0
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
          
          saveToLocalStorage(
            data.settings?.startBalanceUAH ?? null,
            data.settings?.startBalanceUSD ?? null,
            data.settings?.startBalanceEUR ?? null,
            data.settings?.usdRate ?? 41.5,
            data.settings?.eurRate ?? 45,
            normalizedDays || days,
            finalSelectedCurrencies,
            finalExchangeRates
          );
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
  }, [activeBudgetId, selectedCurrencies, exchangeRates, days, setSelectedCurrencies, setExchangeRates, setUsdRate, setEurRate, setStartBalanceUAH, setStartBalanceUSD, setStartBalanceEUR, setBudgets, setDays, setIsLoading, setLoadMessage]);

  return {
    handleExportToJsonFile,
    handleImportFromJsonFile,
    handleJsonFileSelected,
    fileInputRef
  };
}

