import { z } from 'zod';
import { Transaction, Day, Budget, Budgets, UserData, ExchangeRates } from '../types';

/**
 * Схема валідації для ExchangeRates
 * Підтримує як стару структуру (number), так і нову (buy/sell)
 */
const ExchangeRateValueSchema = z.union([
  z.number().positive(),
  z.object({
    buy: z.number().positive(),
    sell: z.number().positive()
  })
]);

export const ExchangeRatesSchema: z.ZodType<ExchangeRates> = z.record(
  z.string(),
  ExchangeRateValueSchema.optional()
);

/**
 * Схема валідації для Transaction
 */
export const TransactionSchema: z.ZodType<Transaction> = z.object({
  id: z.string().min(1),
  type: z.enum(['income', 'expense']),
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  description: z.string()
});

/**
 * Схема валідації для Day
 * Підтримує як нову структуру з transactions, так і legacy поля
 */
export const DaySchema = z.object({
  day: z.number().int().min(1).max(31),
  transactions: z.array(TransactionSchema).default([]),
  description: z.string().optional(),
  // Legacy fields для зворотної сумісності
  incomeUAH: z.number().optional(),
  expenseUAH: z.number().optional(),
  incomeUSD: z.number().optional(),
  expenseUSD: z.number().optional(),
  incomeEUR: z.number().optional(),
  expenseEUR: z.number().optional()
}).passthrough().transform((data) => ({
  ...data,
  transactions: data.transactions || []
})) as z.ZodType<Day>; // Дозволяє додаткові поля для legacy підтримки

/**
 * Схема валідації для Budget
 */
export const BudgetSchema: z.ZodType<Budget> = z.object({
  name: z.string().min(1),
  startBalanceUAH: z.number().nullable().optional(),
  startBalanceUSD: z.number().nullable().optional(),
  startBalanceEUR: z.number().nullable().optional(),
  usdRate: z.number().positive().optional(),
  eurRate: z.number().positive().optional(),
  days: z.array(DaySchema).optional(),
  selectedCurrencies: z.array(z.string()).optional(),
  exchangeRates: ExchangeRatesSchema.optional()
}).passthrough(); // Дозволяє додаткові поля для legacy підтримки

/**
 * Схема валідації для Budgets (об'єкт з бюджетами)
 */
export const BudgetsSchema: z.ZodType<Budgets> = z.record(
  z.string(),
  BudgetSchema
);

/**
 * Схема валідації для UserData
 */
export const UserDataSchema: z.ZodType<UserData> = z.object({
  activeBudgetId: z.string().optional(),
  budgets: BudgetsSchema.optional(),
  savedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // Legacy fields для зворотної сумісності
  startBalanceUAH: z.number().nullable().optional(),
  startBalanceUSD: z.number().nullable().optional(),
  startBalanceEUR: z.number().nullable().optional(),
  usdRate: z.number().positive().optional(),
  eurRate: z.number().positive().optional(),
  days: z.array(DaySchema).optional(),
  selectedCurrencies: z.array(z.string()).optional(),
  exchangeRates: ExchangeRatesSchema.optional(),
  // Encryption fields
  isEncrypted: z.boolean().optional(),
  encryptedData: z.string().optional()
});

/**
 * Функція для безпечної валідації даних з поверненням результату
 * Використовується для валідації даних з Firebase/localStorage
 */
export function validateUserData(data: unknown): { success: true; data: UserData } | { success: false; error: z.ZodError } {
  const result = UserDataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Функція для валідації Budget з викиданням помилки при невалідних даних
 */
export function validateBudget(data: unknown): Budget {
  return BudgetSchema.parse(data);
}

/**
 * Функція для валідації Budgets з викиданням помилки при невалідних даних
 */
export function validateBudgets(data: unknown): Budgets {
  return BudgetsSchema.parse(data);
}

/**
 * Функція для валідації Day з викиданням помилки при невалідних даних
 */
export function validateDay(data: unknown): Day {
  return DaySchema.parse(data);
}

/**
 * Функція для валідації Transaction з викиданням помилки при невалідних даних
 */
export function validateTransaction(data: unknown): Transaction {
  return TransactionSchema.parse(data);
}

/**
 * Функція для валідації ExchangeRates з викиданням помилки при невалідних даних
 */
export function validateExchangeRates(data: unknown): ExchangeRates {
  return ExchangeRatesSchema.parse(data);
}

