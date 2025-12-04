import { Day } from '../types';

// Генерує унікальний ID для транзакції
export const generateTransactionId = (): string => {
  return `t${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      
      const dayObj = day as Day;
      
      // Повертаємо день з валідними транзакціями
      return {
        day: dayObj.day || index + 1,
        transactions: Array.isArray(dayObj.transactions) ? dayObj.transactions : [],
        description: dayObj.description || ''
      };
    });
  }
  return createEmptyMonthDays();
};

