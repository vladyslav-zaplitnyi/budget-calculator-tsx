import { z } from 'zod';
import { Transaction, Day, Budget, Budgets, UserData, ExchangeRates, MonthSlice } from '../types';

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
  description: z.string(),
  date: z.union([z.date(), z.string()]).optional()
});

/**
 * Схема валідації для Day
 * Тільки нова структура з transactions
 */
export const DaySchema = z.object({
  day: z.number().int().min(1).max(31),
  transactions: z.array(TransactionSchema).default([]),
  description: z.string().optional()
}).transform((data) => ({
  day: data.day,
  transactions: data.transactions || [],
  description: data.description || ''
})) as z.ZodType<Day>;

const MonthSliceSchema = z.object({
  days: z.array(DaySchema),
  startBalances: z.record(z.string(), z.number().nullable())
}) as z.ZodType<MonthSlice>;

/**
 * Схема валідації для Budget
 */
export const BudgetSchema: z.ZodType<Budget> = z.object({
  name: z.string().min(1),
  startBalances: z.record(z.string(), z.number().nullable()),
  days: z.array(DaySchema),
  selectedCurrencies: z.array(z.string()),
  exchangeRates: ExchangeRatesSchema,
  monthlyPlans: z.record(z.string(), z.array(TransactionSchema)).optional(),
  plannerStartYear: z.number().int().optional(),
  plannerStartMonth: z.number().int().min(0).max(11).optional(),
  plannerExpandedMonth: z.string().nullable().optional(),
  displayCurrency: z.string().optional(),
  displayCurrencyIndex: z.number().int().optional(),
  budgetDate: z
    .object({
      year: z.number().int(),
      month: z.number().int().min(0).max(11)
    })
    .optional(),
  monthsByKey: z.record(z.string(), MonthSliceSchema).optional()
});

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
  activeBudgetId: z.string(),
  budgets: BudgetsSchema,
  savedAt: z.string().optional(),
  updatedAt: z.string().optional(),
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

