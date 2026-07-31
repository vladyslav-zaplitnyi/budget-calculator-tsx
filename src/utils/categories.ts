/**
 * Статичний список категорій транзакцій.
 * Категорія зберігається в Transaction.category як id зі списку нижче.
 * Відсутність category = "без категорії" (значення за замовчуванням).
 */

export interface TransactionCategory {
  id: string;
  emoji: string;
  name: {
    uk: string;
    en: string;
  };
}

export const TRANSACTION_CATEGORIES: TransactionCategory[] = [
  { id: 'groceries', emoji: '🛒', name: { uk: 'Продукти', en: 'Groceries' } },
  { id: 'cafe', emoji: '☕', name: { uk: 'Кафе і ресторани', en: 'Cafes & restaurants' } },
  { id: 'transport', emoji: '🚌', name: { uk: 'Транспорт', en: 'Transport' } },
  { id: 'travel', emoji: '✈️', name: { uk: 'Подорожі', en: 'Travel' } },
  { id: 'leisure', emoji: '🎮', name: { uk: 'Дозвілля', en: 'Leisure' } },
  { id: 'health', emoji: '💊', name: { uk: "Здоров'я", en: 'Health' } },
  { id: 'shopping', emoji: '🛍️', name: { uk: 'Покупки', en: 'Shopping' } },
  { id: 'utilities', emoji: '💡', name: { uk: "Комуналка та зв'язок", en: 'Utilities' } },
  { id: 'subscriptions', emoji: '📺', name: { uk: 'Підписки', en: 'Subscriptions' } },
  { id: 'transfers', emoji: '🔄', name: { uk: 'Перекази', en: 'Transfers' } },
  { id: 'salary', emoji: '💼', name: { uk: 'Зарплата', en: 'Salary' } },
  { id: 'other', emoji: '📦', name: { uk: 'Інше', en: 'Other' } }
];

export function getCategoryById(id: string | undefined | null): TransactionCategory | null {
  if (!id) return null;
  return TRANSACTION_CATEGORIES.find((c) => c.id === id) || null;
}

/** Локалізована назва категорії, або null якщо категорії немає. */
export function getCategoryLabel(id: string | undefined | null, language: string): string | null {
  const category = getCategoryById(id);
  if (!category) return null;
  return language === 'uk' ? category.name.uk : category.name.en;
}

/** Емодзі категорії, або порожній рядок. */
export function getCategoryEmoji(id: string | undefined | null): string {
  return getCategoryById(id)?.emoji || '';
}
