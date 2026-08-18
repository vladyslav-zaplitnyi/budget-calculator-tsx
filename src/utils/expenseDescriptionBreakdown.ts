export const EXPENSE_REMAINDER_KEY = '__other__';
export const UNNAMED_DESCRIPTION_KEY = '—';
/** Same sentinel as the analytics category filter for untagged expenses. */
export const UNCATEGORIZED_KEY = '__none__';

export interface DescriptionAmount {
  description?: string;
  convertedAmount: number;
}

export interface DescriptionGroup {
  name: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

function displayNameFromKey(key: string): string {
  if (key === UNNAMED_DESCRIPTION_KEY) return UNNAMED_DESCRIPTION_KEY;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Groups expenses by description. When there are more than `collapseAfter + 1`
 * distinct names, the top N stay listed and the rest become one remainder bucket
 * (plus the original remainder groups for an expandable list).
 */
export function buildExpenseDescriptionBreakdown(
  expenses: DescriptionAmount[],
  options: { collapseAfter?: number } = {}
): { groups: DescriptionGroup[]; remainderGroups: DescriptionGroup[] } {
  const collapseAfter = options.collapseAfter ?? 6;
  const total = expenses.reduce((sum, expense) => sum + expense.convertedAmount, 0);

  const map = new Map<string, { totalAmount: number; count: number }>();
  expenses.forEach((expense) => {
    const key = (expense.description || '').trim().toLowerCase() || UNNAMED_DESCRIPTION_KEY;
    const existing = map.get(key);
    if (existing) {
      existing.totalAmount += expense.convertedAmount;
      existing.count += 1;
    } else {
      map.set(key, { totalAmount: expense.convertedAmount, count: 1 });
    }
  });

  const raw: DescriptionGroup[] = Array.from(map.entries())
    .map(([key, data]) => ({
      name: displayNameFromKey(key),
      totalAmount: data.totalAmount,
      count: data.count,
      percentage: total > 0 ? (data.totalAmount / total) * 100 : 0
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  if (collapseAfter > 0 && raw.length > collapseAfter + 1) {
    const top = raw.slice(0, collapseAfter);
    const rest = raw.slice(collapseAfter);
    const otherTotal = rest.reduce((sum, group) => sum + group.totalAmount, 0);
    const otherCount = rest.reduce((sum, group) => sum + group.count, 0);
    const remainderBucket: DescriptionGroup = {
      name: EXPENSE_REMAINDER_KEY,
      totalAmount: otherTotal,
      count: otherCount,
      percentage: total > 0 ? (otherTotal / total) * 100 : 0
    };
    const groups = [...top, remainderBucket].sort((a, b) => b.totalAmount - a.totalAmount);
    return { groups, remainderGroups: rest };
  }

  return { groups: raw, remainderGroups: [] };
}

export interface CategorizedAmount {
  category?: string;
  convertedAmount: number;
}

export interface CategoryGroup {
  id: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

export function expenseCategoryKey(category?: string | null): string {
  const trimmed = (category || '').trim();
  return trimmed || UNCATEGORIZED_KEY;
}

/**
 * Groups expenses by transaction category id. Untagged expenses share
 * `UNCATEGORIZED_KEY`. Different descriptions in the same category become one row.
 */
export function buildExpenseCategoryBreakdown(
  expenses: CategorizedAmount[]
): CategoryGroup[] {
  const total = expenses.reduce((sum, expense) => sum + expense.convertedAmount, 0);
  const map = new Map<string, { totalAmount: number; count: number }>();

  expenses.forEach((expense) => {
    const key = expenseCategoryKey(expense.category);
    const existing = map.get(key);
    if (existing) {
      existing.totalAmount += expense.convertedAmount;
      existing.count += 1;
    } else {
      map.set(key, { totalAmount: expense.convertedAmount, count: 1 });
    }
  });

  return Array.from(map.entries())
    .map(([id, data]) => ({
      id,
      totalAmount: data.totalAmount,
      count: data.count,
      percentage: total > 0 ? (data.totalAmount / total) * 100 : 0
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
