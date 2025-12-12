import { Day } from '../types';
import { getDaysInMonth } from './dateHelpers';

// Генерує унікальний ID для транзакції
export const generateTransactionId = (): string => {
  return `t${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Створює порожній масив днів для конкретного року і місяця
export const createEmptyMonthDays = (year?: number, month?: number): Day[] => {
  // Якщо рік і місяць не вказані, використовуємо поточну дату
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth();
  
  // Отримуємо кількість днів у місяці
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  
  const initialDays: Day[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
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

