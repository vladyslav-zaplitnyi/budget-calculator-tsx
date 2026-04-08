import { Day, ExchangeRates, Transaction } from '../types';
import { isExchangeRatePair, isExchangeRateNumber } from './typeGuards';
import { BASE_CURRENCY } from './currencies';

// Calculation functions for budget tracker

/**
 * Sanitize raw user input so that "2,3" → "2.3", "15 000" → "15000", etc.
 * Returns a clean string safe for parseFloat().
 */
export const sanitizeNumberInput = (raw: string): string => {
  let s = raw.replace(/\s/g, '');
  s = s.replace(',', '.');
  return s;
};

// Функція для форматування чисел з роздільниками тисяч та фіксованою кількістю десяткових знаків
export const formatNumber = (value: number, decimals: number = 2): string => {
  if (isNaN(value) || !isFinite(value)) {
    return '0.00';
  }
  
  // Округлюємо до потрібної кількості десяткових знаків
  const rounded = Number(value.toFixed(decimals));
  
  // Розділяємо на цілу та дробову частини
  const parts = rounded.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  // Додаємо роздільники тисяч до цілої частини
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  // Повертаємо відформатоване число
  if (decimals > 0) {
    const paddedDecimal = decimalPart.padEnd(decimals, '0');
    return `${formattedInteger}.${paddedDecimal}`;
  }
  
  return formattedInteger;
};

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

  // НОВА ЛОГІКА: працюємо з парною структурою курсів (BASE_CURRENCY_CUR, CUR_BASE_CURRENCY тощо)
  const BASE = BASE_CURRENCY;

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
export const calculateDayAmountsFromTransactions = (day: Day | null | undefined, selectedCurrencies: string[] = ['UAH', 'USD', 'EUR']): Record<string, number> => {
  if (!day) {
    // Якщо day не визначений, повертаємо порожні суми
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
    return amounts;
  }
  
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
      const incomeKey = `income${currency}`;
      if (amounts[incomeKey] !== undefined) {
        amounts[incomeKey] += amount;
      }
    } else if (type === 'expense') {
      const expenseKey = `expense${currency}`;
      if (amounts[expenseKey] !== undefined) {
        amounts[expenseKey] += amount;
      }
    }
  });

  return amounts;
};

// Застарілі функції для зворотної сумісності (deprecated)
// Використовуйте calculateDayBalance(day, currencyCode) замість них
/** @deprecated Використовуйте calculateDayBalance(day, 'UAH') замість цього */
export const calculateDayBalanceUAH = (day: Day | null | undefined): number => {
  return calculateDayBalance(day, 'UAH');
};

/** @deprecated Використовуйте calculateDayBalance(day, 'USD') замість цього */
export const calculateDayBalanceUSD = (day: Day | null | undefined): number => {
  return calculateDayBalance(day, 'USD');
};

/** @deprecated Використовуйте calculateDayBalance(day, 'EUR') замість цього */
export const calculateDayBalanceEUR = (day: Day | null | undefined): number => {
  return calculateDayBalance(day, 'EUR');
};

/** @deprecated Використовуйте calculateCumulativeBalance(dayIndex, days, startBalance, 'UAH') замість цього */
export const calculateCumulativeBalanceUAH = (dayIndex: number, days: Day[], startBalanceUAH: number | null): number => {
  return calculateCumulativeBalance(dayIndex, days, startBalanceUAH, 'UAH');
};

/** @deprecated Використовуйте calculateCumulativeBalance(dayIndex, days, startBalance, 'USD') замість цього */
export const calculateCumulativeBalanceUSD = (dayIndex: number, days: Day[], startBalanceUSD: number | null): number => {
  return calculateCumulativeBalance(dayIndex, days, startBalanceUSD, 'USD');
};

/** @deprecated Використовуйте calculateCumulativeBalance(dayIndex, days, startBalance, 'EUR') замість цього */
export const calculateCumulativeBalanceEUR = (dayIndex: number, days: Day[], startBalanceEUR: number | null): number => {
  return calculateCumulativeBalance(dayIndex, days, startBalanceEUR, 'EUR');
};

export interface Totals {
  [key: string]: number | undefined;
  // Застарілі поля для зворотної сумісності (опціональні)
  totalIncomeUAH?: number;
  totalExpenseUAH?: number;
  totalIncomeUSD?: number;
  totalExpenseUSD?: number;
  totalIncomeEUR?: number;
  totalExpenseEUR?: number;
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
    if (!day) return; // Пропускаємо undefined/null дні
    const amounts = calculateDayAmountsFromTransactions(day, selectedCurrencies);
    
    // Обчислюємо totals для всіх обраних валют
    selectedCurrencies.forEach(code => {
      const incomeKey = `income${code}`;
      const expenseKey = `expense${code}`;
      totals[`totalIncome${code}`] += amounts[incomeKey] || 0;
      totals[`totalExpense${code}`] += amounts[expenseKey] || 0;
    });

    // Всі дані в транзакціях
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
export const calculateDayBalance = (day: Day | null | undefined, currencyCode: string): number => {
  if (!day) return 0;
  const amounts = calculateDayAmountsFromTransactions(day);
  const incomeKey = `income${currencyCode}`;
  const expenseKey = `expense${currencyCode}`;
  
  return (amounts[incomeKey] || 0) - (amounts[expenseKey] || 0);
};

// Універсальна функція для обчислення накопиченого балансу
export const calculateCumulativeBalance = (dayIndex: number, days: Day[], startBalance: number | null, currencyCode: string): number => {
  let cumulative = parseFloat(String(startBalance)) || 0;
  for (let i = 0; i <= dayIndex; i++) {
    if (days[i]) {
      cumulative += calculateDayBalance(days[i], currencyCode);
    }
  }
  return cumulative;
};

export const calculateFinalBalances = (
  days: Day[], 
  selectedCurrencies: string[] = ['UAH', 'USD', 'EUR'], 
  startBalances: Record<string, number | null> = {},
  totals?: Totals,
  // Застарілі параметри для зворотної сумісності (deprecated)
  startBalanceUAH?: number | null, 
  startBalanceUSD?: number | null, 
  startBalanceEUR?: number | null
): Record<string, number> => {
  // Обчислюємо totals, якщо не передано
  const calculatedTotals = totals || calculateTotals(days, selectedCurrencies);

  // Динамічні баланси для вибраних валют - використовуємо різницю з Детальної статистики
  const finalBalances: Record<string, number> = {};

  selectedCurrencies.forEach(currencyCode => {
    // Спочатку перевіряємо startBalances, потім застарілі параметри для зворотної сумісності
    const startBalance = startBalances[currencyCode] ?? 
      (currencyCode === 'UAH' ? (startBalanceUAH ?? null) : 
       currencyCode === 'USD' ? (startBalanceUSD ?? null) : 
       currencyCode === 'EUR' ? (startBalanceEUR ?? null) : null);
    
    const startBalanceValue = parseFloat(String(startBalance)) || 0;
    const incomeKey = `totalIncome${currencyCode}`;
    const expenseKey = `totalExpense${currencyCode}`;
    const totalIncome = calculatedTotals[incomeKey] || 0;
    const totalExpense = calculatedTotals[expenseKey] || 0;
    const difference = totalIncome - totalExpense;
    
    // Поточний стан бюджету = початковий баланс + різниця у валюті з Детальної статистики
    finalBalances[`finalBalance${currencyCode}`] = startBalanceValue + difference;
  });

  // Для зворотної сумісності додаємо застарілі поля
  if (selectedCurrencies.includes('UAH')) {
    finalBalances.finalBalanceUAH = finalBalances.finalBalanceUAH ?? 0;
  }
  if (selectedCurrencies.includes('USD')) {
    finalBalances.finalBalanceUSD = finalBalances.finalBalanceUSD ?? 0;
  }
  if (selectedCurrencies.includes('EUR')) {
    finalBalances.finalBalanceEUR = finalBalances.finalBalanceEUR ?? 0;
  }

  return finalBalances;
};

