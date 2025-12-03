import { Transaction, Day } from '../types';

// Генерує унікальний ID для транзакції
export const generateTransactionId = (): string => {
  return `t${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Мігрує старі дані дня до нової структури з транзакціями
export const migrateDayToTransactions = (day: Day): Day => {
  const transactions: Transaction[] = [];
  
  // Перевіряємо, чи вже є транзакції
  if (day.transactions && Array.isArray(day.transactions) && day.transactions.length > 0) {
    return day; // Вже мігровано
  }

  // Мігруємо старі поля до транзакцій
  const oldDescription = String(day.description || '').trim();
  const hasOldData = 
    (Number(day.incomeUAH) || 0) !== 0 ||
    (Number(day.expenseUAH) || 0) !== 0 ||
    (Number(day.incomeUSD) || 0) !== 0 ||
    (Number(day.expenseUSD) || 0) !== 0 ||
    (Number(day.incomeEUR) || 0) !== 0 ||
    (Number(day.expenseEUR) || 0) !== 0;

  if (hasOldData) {
    // Створюємо транзакції зі старих даних
    const incomeUAH = Number(day.incomeUAH) || 0;
    const expenseUAH = Number(day.expenseUAH) || 0;
    const incomeUSD = Number(day.incomeUSD) || 0;
    const expenseUSD = Number(day.expenseUSD) || 0;
    const incomeEUR = Number(day.incomeEUR) || 0;
    const expenseEUR = Number(day.expenseEUR) || 0;

    if (incomeUAH > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'income',
        amount: incomeUAH,
        currency: 'UAH',
        description: oldDescription || 'Міграція даних: Дохід UAH'
      });
    }
    if (expenseUAH > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'expense',
        amount: expenseUAH,
        currency: 'UAH',
        description: oldDescription || 'Міграція даних: Витрата UAH'
      });
    }
    if (incomeUSD > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'income',
        amount: incomeUSD,
        currency: 'USD',
        description: oldDescription || 'Міграція даних: Дохід USD'
      });
    }
    if (expenseUSD > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'expense',
        amount: expenseUSD,
        currency: 'USD',
        description: oldDescription || 'Міграція даних: Витрата USD'
      });
    }
    if (incomeEUR > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'income',
        amount: incomeEUR,
        currency: 'EUR',
        description: oldDescription || 'Міграція даних: Дохід EUR'
      });
    }
    if (expenseEUR > 0) {
      transactions.push({
        id: generateTransactionId(),
        type: 'expense',
        amount: expenseEUR,
        currency: 'EUR',
        description: oldDescription || 'Міграція даних: Витрата EUR'
      });
    }
  }

  return {
    ...day,
    day: day.day || 0,
    transactions: transactions,
    // Залишаємо старі поля для backward compatibility, але вони тепер computed
    description: oldDescription,
    incomeUAH: 0,
    expenseUAH: 0,
    incomeUSD: 0,
    expenseUSD: 0,
    incomeEUR: 0,
    expenseEUR: 0
  };
};

// Створює порожній масив на 31 день
export const createEmptyMonthDays = (): Day[] => {
  const initialDays: Day[] = [];
  for (let i = 1; i <= 31; i++) {
    initialDays.push({
      day: i,
      transactions: [],
      description: '',
      // Залишаємо для backward compatibility
      incomeUAH: 0,
      expenseUAH: 0,
      incomeUSD: 0,
      expenseUSD: 0,
      incomeEUR: 0,
      expenseEUR: 0
    });
  }
  return initialDays;
};

// Приводить масив днів з бекенду/LocalStorage до очікуваного формату
export const normalizeDaysArray = (sourceDays: any[]): Day[] => {
  if (sourceDays && Array.isArray(sourceDays) && sourceDays.length === 31) {
    return sourceDays.map((day, index) => {
      const normalizedDay: Day = {
        day: day.day || index + 1,
        transactions: Array.isArray(day.transactions) ? day.transactions : [],
        description: String(day.description || ''),
        // Залишаємо для backward compatibility
        incomeUAH: Number(day.incomeUAH) || 0,
        expenseUAH: Number(day.expenseUAH) || 0,
        incomeUSD: Number(day.incomeUSD) || 0,
        expenseUSD: Number(day.expenseUSD) || 0,
        incomeEUR: Number(day.incomeEUR) || 0,
        expenseEUR: Number(day.expenseEUR) || 0,
        ...day
      };
      
      // Мігруємо старі дані, якщо потрібно
      return migrateDayToTransactions(normalizedDay);
    });
  }
  return createEmptyMonthDays();
};

