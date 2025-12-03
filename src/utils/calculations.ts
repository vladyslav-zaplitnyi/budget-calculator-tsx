import { Day, ExchangeRates, Transaction } from '../types';
import { isExchangeRatePair, isExchangeRateNumber } from './typeGuards';

// Calculation functions for budget tracker

// Функція для конвертації суми з однієї валюти в іншу
export const convertCurrency = (amount: number, fromCurrency: string, toCurrency: string, exchangeRates: ExchangeRates = {}): number => {
  if (!amount || fromCurrency === toCurrency) {
    return amount;
  }

  const safeAmount = Number(amount) || 0;
  const from = String(fromCurrency || 'UAH').toUpperCase();
  const to = String(toCurrency || 'UAH').toUpperCase();

  // Перевіряємо, чи використовується нова структура курсів (пари валют з buy/sell)
  const hasPairStructure = Object.keys(exchangeRates || {}).some(
    (key) =>
      key.includes('_') &&
      isExchangeRatePair(exchangeRates[key])
  );

  // Якщо нової структури немає – використовуємо стару логіку (для зворотної сумісності)
  if (!hasPairStructure) {
    if (from === to) {
      return safeAmount;
    }

    if (to === 'UAH') {
      // Продаємо from-валюту за гривню
      const rateValue = exchangeRates[from];
      const rateToUAH = isExchangeRateNumber(rateValue) ? rateValue : 1;
      return safeAmount * rateToUAH;
    }

    if (from === 'UAH') {
      // Купуємо to-валюту за гривню
      const rateValue = exchangeRates[to];
      const rateFromUAH = isExchangeRateNumber(rateValue) ? rateValue : 1;
      return rateFromUAH ? safeAmount / rateFromUAH : safeAmount;
    }

    // Конвертація між двома не-UAH валютами через гривню
    const rateFromValue = exchangeRates[from];
    const rateToValue = exchangeRates[to];
    const rateFromToUAH = isExchangeRateNumber(rateFromValue) ? rateFromValue : 1;
    const rateUAHToTo = isExchangeRateNumber(rateToValue) ? rateToValue : 1;
    const amountInUAH = safeAmount * rateFromToUAH;
    return rateUAHToTo ? amountInUAH / rateUAHToTo : safeAmount;
  }

  // НОВА ЛОГІКА: працюємо з парною структурою курсів (UAH_USD, USD_UAH тощо)
  const BASE = 'UAH';

  // Допоміжна: конвертувати будь-яку валюту в базову (UAH)
  const toBase = (value: number, currency: string): number => {
    const cur = String(currency || BASE).toUpperCase();
    if (cur === BASE) return value;

    const directPairKey = `${BASE}_${cur}`;
    const reversePairKey = `${cur}_${BASE}`;

    const directPair = exchangeRates[directPairKey];
    const reversePair = exchangeRates[reversePairKey];

    // Основний шлях: є пара BASE_CUR, множимо на курс продажу (скільки UAH за 1 од. валюти)
    if (directPair && typeof directPair === 'object') {
      const sellRate =
        (typeof directPair.sell === 'number' && directPair.sell) ||
        (typeof directPair.buy === 'number' && directPair.buy) ||
        1;
      return value * sellRate;
    }

    // Резервний шлях: є зворотна пара CUR_BASE, тоді її курс ~ UAH за 1 CUR = 1 / (CUR_BASE)
    if (reversePair && typeof reversePair === 'object') {
      const reverse =
        (typeof reversePair.buy === 'number' && reversePair.buy) ||
        (typeof reversePair.sell === 'number' && reversePair.sell) ||
        0;
      if (!reverse) return value;
      return value / reverse;
    }

    return value;
  };

  // Допоміжна: конвертувати базову валюту (UAH) в будь-яку іншу
  const fromBase = (valueInBase: number, currency: string): number => {
    const cur = String(currency || BASE).toUpperCase();
    if (cur === BASE) return valueInBase;

    const directPairKey = `${BASE}_${cur}`;
    const reversePairKey = `${cur}_${BASE}`;

    const directPair = exchangeRates[directPairKey];
    const reversePair = exchangeRates[reversePairKey];

    // Основний шлях: є пара BASE_CUR, ділимо на курс купівлі (скільки UAH треба за 1 од. валюти)
    if (directPair && typeof directPair === 'object') {
      const buyRate =
        (typeof directPair.buy === 'number' && directPair.buy) ||
        (typeof directPair.sell === 'number' && directPair.sell) ||
        1;
      return buyRate ? valueInBase / buyRate : valueInBase;
    }

    // Резервний шлях: є зворотна пара CUR_BASE, тоді множимо на неї (скільки CUR за 1 UAH)
    if (reversePair && typeof reversePair === 'object') {
      const rate =
        (typeof reversePair.sell === 'number' && reversePair.sell) ||
        (typeof reversePair.buy === 'number' && reversePair.buy) ||
        0;
      if (!rate) return valueInBase;
      return valueInBase * rate;
    }

    return valueInBase;
  };

  // 1) Конвертуємо з from у базову валюту (UAH)
  const amountInBase = toBase(safeAmount, from);

  // 2) Конвертуємо з базової валюти в цільову
  return fromBase(amountInBase, to);
};

// Обчислює суми з транзакцій для дня (універсальна функція)
export const calculateDayAmountsFromTransactions = (day: Day, selectedCurrencies: string[] = ['UAH', 'USD', 'EUR']): Record<string, number> => {
  const transactions = Array.isArray(day.transactions) ? day.transactions : [];
  
  // Створюємо об'єкт для всіх вибраних валют
  const amounts: Record<string, number> = {};
  selectedCurrencies.forEach(code => {
    amounts[`income${code}`] = 0;
    amounts[`expense${code}`] = 0;
  });

  // Для зворотної сумісності залишаємо старі поля
  amounts.incomeUAH = 0;
  amounts.expenseUAH = 0;
  amounts.incomeUSD = 0;
  amounts.expenseUSD = 0;
  amounts.incomeEUR = 0;
  amounts.expenseEUR = 0;

  transactions.forEach((transaction: Transaction) => {
    const amount = parseFloat(String(transaction.amount)) || 0;
    const currency = String(transaction.currency || 'UAH').toUpperCase();
    const type = String(transaction.type || 'expense').toLowerCase();

    if (type === 'income') {
      if (amounts[`income${currency}`] !== undefined) {
        amounts[`income${currency}`] += amount;
      }
    } else if (type === 'expense') {
      if (amounts[`expense${currency}`] !== undefined) {
        amounts[`expense${currency}`] += amount;
      }
    }
  });

  return amounts;
};

// Обчислює баланс дня з транзакцій або старих полів (backward compatibility)
export const calculateDayBalanceUAH = (day: Day): number => {
  const amounts = calculateDayAmountsFromTransactions(day);
  // Якщо є транзакції, використовуємо їх, інакше старі поля
  if (amounts.incomeUAH > 0 || amounts.expenseUAH > 0) {
    return amounts.incomeUAH - amounts.expenseUAH;
  }
  return (parseFloat(String(day.incomeUAH)) || 0) - (parseFloat(String(day.expenseUAH)) || 0);
};

export const calculateDayBalanceUSD = (day: Day): number => {
  const amounts = calculateDayAmountsFromTransactions(day);
  if (amounts.incomeUSD > 0 || amounts.expenseUSD > 0) {
    return amounts.incomeUSD - amounts.expenseUSD;
  }
  return (parseFloat(String(day.incomeUSD)) || 0) - (parseFloat(String(day.expenseUSD)) || 0);
};

export const calculateDayBalanceEUR = (day: Day): number => {
  const amounts = calculateDayAmountsFromTransactions(day);
  if (amounts.incomeEUR > 0 || amounts.expenseEUR > 0) {
    return amounts.incomeEUR - amounts.expenseEUR;
  }
  return (parseFloat(String(day.incomeEUR)) || 0) - (parseFloat(String(day.expenseEUR)) || 0);
};

export const calculateCumulativeBalanceUAH = (dayIndex: number, days: Day[], startBalanceUAH: number | null): number => {
  let cumulative = parseFloat(String(startBalanceUAH)) || 0;
  for (let i = 0; i <= dayIndex; i++) {
    cumulative += calculateDayBalanceUAH(days[i]);
  }
  return cumulative;
};

export const calculateCumulativeBalanceUSD = (dayIndex: number, days: Day[], startBalanceUSD: number | null): number => {
  let cumulative = parseFloat(String(startBalanceUSD)) || 0;
  for (let i = 0; i <= dayIndex; i++) {
    cumulative += calculateDayBalanceUSD(days[i]);
  }
  return cumulative;
};

export const calculateCumulativeBalanceEUR = (dayIndex: number, days: Day[], startBalanceEUR: number | null): number => {
  let cumulative = parseFloat(String(startBalanceEUR)) || 0;
  for (let i = 0; i <= dayIndex; i++) {
    cumulative += calculateDayBalanceEUR(days[i]);
  }
  return cumulative;
};

export interface Totals {
  [key: string]: number;
  totalIncomeUAH: number;
  totalExpenseUAH: number;
  totalIncomeUSD: number;
  totalExpenseUSD: number;
  totalIncomeEUR: number;
  totalExpenseEUR: number;
}

export const calculateTotals = (days: Day[], selectedCurrencies: string[] = ['UAH', 'USD', 'EUR']): Totals => {
  // Створюємо об'єкт для totals всіх валют
  const totals: Record<string, number> = {};
  selectedCurrencies.forEach(code => {
    totals[`totalIncome${code}`] = 0;
    totals[`totalExpense${code}`] = 0;
  });

  // Для зворотної сумісності залишаємо старі поля
  let totalIncomeUAH = 0;
  let totalExpenseUAH = 0;
  let totalIncomeUSD = 0;
  let totalExpenseUSD = 0;
  let totalIncomeEUR = 0;
  let totalExpenseEUR = 0;

  days.forEach(day => {
    const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
    
    // Обчислюємо totals для всіх обраних валют
    selectedCurrencies.forEach(code => {
      const incomeKey = `income${code}`;
      const expenseKey = `expense${code}`;
      totals[`totalIncome${code}`] += amounts[incomeKey] || 0;
      totals[`totalExpense${code}`] += amounts[expenseKey] || 0;
    });

    // Для зворотної сумісності - додаємо тільки якщо немає транзакцій (backward compatibility)
    // Якщо є транзакції, дані вже додані через цикл selectedCurrencies вище
    const hasTransactions = amounts.incomeUAH > 0 || amounts.expenseUAH > 0 || 
                            amounts.incomeUSD > 0 || amounts.expenseUSD > 0 ||
                            amounts.incomeEUR > 0 || amounts.expenseEUR > 0;
    
    if (!hasTransactions) {
      // Backward compatibility - якщо немає транзакцій, використовуємо старі поля
      totalIncomeUAH += parseFloat(String(day.incomeUAH)) || 0;
      totalExpenseUAH += parseFloat(String(day.expenseUAH)) || 0;
      totalIncomeUSD += parseFloat(String(day.incomeUSD)) || 0;
      totalExpenseUSD += parseFloat(String(day.expenseUSD)) || 0;
      totalIncomeEUR += parseFloat(String(day.incomeEUR)) || 0;
      totalExpenseEUR += parseFloat(String(day.expenseEUR)) || 0;
    }
  });

  return {
    ...totals,
    // Для зворотної сумісності - використовуємо totals якщо є, інакше backward compatibility значення
    totalIncomeUAH: totals.totalIncomeUAH !== undefined ? totals.totalIncomeUAH : totalIncomeUAH,
    totalExpenseUAH: totals.totalExpenseUAH !== undefined ? totals.totalExpenseUAH : totalExpenseUAH,
    totalIncomeUSD: totals.totalIncomeUSD !== undefined ? totals.totalIncomeUSD : totalIncomeUSD,
    totalExpenseUSD: totals.totalExpenseUSD !== undefined ? totals.totalExpenseUSD : totalExpenseUSD,
    totalIncomeEUR: totals.totalIncomeEUR !== undefined ? totals.totalIncomeEUR : totalIncomeEUR,
    totalExpenseEUR: totals.totalExpenseEUR !== undefined ? totals.totalExpenseEUR : totalExpenseEUR
  };
};

// Універсальна функція для обчислення балансу дня для будь-якої валюти
export const calculateDayBalance = (day: Day, currencyCode: string): number => {
  const amounts = calculateDayAmountsFromTransactions(day);
  const incomeKey = `income${currencyCode}`;
  const expenseKey = `expense${currencyCode}`;
  
  // Спочатку пробуємо з транзакцій
  if (amounts[incomeKey] !== undefined || amounts[expenseKey] !== undefined) {
    return (amounts[incomeKey] || 0) - (amounts[expenseKey] || 0);
  }
  
  // Для зворотної сумісності зі старими полями
  const oldIncomeKey = `income${currencyCode}`;
  const oldExpenseKey = `expense${currencyCode}`;
  if (day[oldIncomeKey] !== undefined || day[oldExpenseKey] !== undefined) {
    return (parseFloat(String(day[oldIncomeKey])) || 0) - (parseFloat(String(day[oldExpenseKey])) || 0);
  }
  
  return 0;
};

// Універсальна функція для обчислення накопиченого балансу
export const calculateCumulativeBalance = (dayIndex: number, days: Day[], startBalance: number | null, currencyCode: string): number => {
  let cumulative = parseFloat(String(startBalance)) || 0;
  for (let i = 0; i <= dayIndex; i++) {
    cumulative += calculateDayBalance(days[i], currencyCode);
  }
  return cumulative;
};

export const calculateFinalBalances = (
  days: Day[], 
  startBalanceUAH: number | null, 
  startBalanceUSD: number | null, 
  startBalanceEUR: number | null, 
  selectedCurrencies: string[] = ['UAH', 'USD', 'EUR'], 
  startBalances: Record<string, number | null> = {}
): Record<string, number> => {
  // Для зворотної сумісності
  const finalBalanceUAH = calculateCumulativeBalanceUAH(30, days, startBalanceUAH);
  const finalBalanceUSD = calculateCumulativeBalanceUSD(30, days, startBalanceUSD);
  const finalBalanceEUR = calculateCumulativeBalanceEUR(30, days, startBalanceEUR);

  // Динамічні баланси для вибраних валют
  const finalBalances: Record<string, number> = {
    finalBalanceUAH,
    finalBalanceUSD,
    finalBalanceEUR
  };

  selectedCurrencies.forEach(currencyCode => {
    const startBalance = startBalances[currencyCode] ?? 
      (currencyCode === 'UAH' ? startBalanceUAH : 
       currencyCode === 'USD' ? startBalanceUSD : 
       currencyCode === 'EUR' ? startBalanceEUR : null);
    finalBalances[`finalBalance${currencyCode}`] = calculateCumulativeBalance(30, days, startBalance, currencyCode);
  });

  return finalBalances;
};

