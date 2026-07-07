export const LANGUAGE_STORAGE_KEY = 'budgetTrackerLanguage';
export const LANGUAGE_COOKIE_KEY = 'budgetTrackerLanguage';
export const ACTIVE_BUDGET_COOKIE_KEY = 'budgetTrackerActiveBudgetId';
/** Active Firestore budget book (`users/{uid}/budgetBooks/{id}`) for signed-in users. */
export const ACTIVE_BUDGET_BOOK_COOKIE_KEY = 'budgetTrackerActiveBudgetBookId';

/** Temporarily disable creating a second budget book (reduces Firestore load). */
export const BUDGET_BOOK_CREATE_ENABLED = false;

