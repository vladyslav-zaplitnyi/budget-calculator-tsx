import { Transaction, Day } from '../types';

// Генерує унікальний ID для транзакції
export const generateTransactionId = (): string => {
  return `t${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Тип для legacy-даних дня (для міграції)
interface LegacyDay {
  day: number;
  transactions?: Transaction[];
  description?: string;
  incomeUAH?: number;
  expenseUAH?: number;
  incomeUSD?: number;
  expenseUSD?: number;
  incomeEUR?: number;
  expenseEUR?: number;
  [key: string]: any;
}

// Мігрує старі дані дня до нової структури з транзакціями
export const migrateDayToTransactions = (day: LegacyDay | Day): Day => {
  const transactions: Transaction[] = [];
  
  // Перевіряємо, чи вже є транзакції
  if (day.transactions && Array.isArray(day.transactions) && day.transactions.length > 0) {
    return {
      day: day.day || 0,
      transactions: day.transactions,
      description: day.description || ''
    };
  }

  const legacyDay = day as LegacyDay;
  
  // Мігруємо старі поля до транзакцій
  const oldDescription = String(legacyDay.description || '').trim();
  const hasOldData = 
    (Number(legacyDay.incomeUAH) || 0) !== 0 ||
    (Number(legacyDay.expenseUAH) || 0) !== 0 ||
    (Number(legacyDay.incomeUSD) || 0) !== 0 ||
    (Number(legacyDay.expenseUSD) || 0) !== 0 ||
    (Number(legacyDay.incomeEUR) || 0) !== 0 ||
    (Number(legacyDay.expenseEUR) || 0) !== 0;

  if (hasOldData) {
    // Створюємо транзакції зі старих даних
    const incomeUAH = Number(legacyDay.incomeUAH) || 0;
    const expenseUAH = Number(legacyDay.expenseUAH) || 0;
    const incomeUSD = Number(legacyDay.incomeUSD) || 0;
    const expenseUSD = Number(legacyDay.expenseUSD) || 0;
    const incomeEUR = Number(legacyDay.incomeEUR) || 0;
    const expenseEUR = Number(legacyDay.expenseEUR) || 0;

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

  // Повертаємо чистий Day без legacy-полів
  return {
    day: legacyDay.day || 0,
    transactions: transactions,
    description: oldDescription
  };
};

// Створює порожній масив на 31 день
export const createEmptyMonthDays = (): Day[] => {
  const initialDays: Day[] = [];
  for (let i = 1; i <= 31; i++) {
    initialDays.push({
      day: i,
      transactions: [],
      description: ''
    });
  }
  return initialDays;
};

// Приводить масив днів з бекенду/LocalStorage до очікуваного формату
export const normalizeDaysArray = (sourceDays: unknown[]): Day[] => {
  if (sourceDays && Array.isArray(sourceDays) && sourceDays.length === 31) {
    return sourceDays.map((day, index) => {
      // Якщо day є null або undefined, створюємо порожній день
      if (!day || typeof day !== 'object') {
        return {
          day: index + 1,
          transactions: [],
          description: ''
        };
      }
      
      const legacyDay: LegacyDay = day as any;
      
      // Мігруємо старі дані, якщо потрібно
      return migrateDayToTransactions(legacyDay);
    });
  }
  return createEmptyMonthDays();
};

