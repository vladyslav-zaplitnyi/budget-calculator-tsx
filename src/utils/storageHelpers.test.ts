import type { User } from 'firebase/auth';
import { loadFromFirestore } from './storageHelpers';
import { loadUserBudgetFirestoreState } from '../services/budgetBooksFirestore';

jest.mock('../services/budgetBooksFirestore', () => ({
  loadUserBudgetFirestoreState: jest.fn(),
  saveBudgetBookToFirestore: jest.fn(),
  ReadOnlyBudgetBookError: class ReadOnlyBudgetBookError extends Error {},
  DEFAULT_BUDGET_BOOK_ID: 'default'
}));

const mockedLoad = loadUserBudgetFirestoreState as jest.MockedFunction<
  typeof loadUserBudgetFirestoreState
>;

const user = { uid: 'test-user' } as User;

const loadedData = {
  activeBudgetId: 'default',
  budgets: {
    default: {
      name: 'Test',
      startBalances: {},
      selectedCurrencies: ['UAH'],
      exchangeRates: {},
      days: [],
      displayCurrency: 'UAH',
      displayCurrencyIndex: 0,
      budgetDate: { year: 2026, month: 0 }
    }
  },
  days: [],
  selectedCurrencies: ['UAH'],
  exchangeRates: {}
};

describe('loadFromFirestore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('повертає null, коли в користувача ще немає даних', async () => {
    mockedLoad.mockResolvedValue(null);
    await expect(loadFromFirestore(user, null)).resolves.toBeNull();
  });

  it('повертає прапорець потреби пароля для зашифрованих даних', async () => {
    mockedLoad.mockResolvedValue({ kind: 'needsPassword' });
    await expect(loadFromFirestore(user, null)).resolves.toEqual({
      isEncrypted: true,
      needsPassword: true
    });
  });

  it('пробрасує помилку читання, а не повертає null', async () => {
    // null трактується як "новий користувач" і призводить до перезапису
    // реальних даних у Firestore порожнім бюджетом.
    mockedLoad.mockRejectedValue(new Error('network down'));
    await expect(loadFromFirestore(user, null)).rejects.toThrow('network down');
  });

  it('повертає завантажені дані разом зі списком книг', async () => {
    mockedLoad.mockResolvedValue({
      kind: 'data',
      data: loadedData,
      budgetBooks: [{ id: 'default', displayLabel: 'Personal', isReadOnly: false }],
      currentBudgetBookId: 'default',
      currentBudgetBookIsReadOnly: false
    });

    const result = await loadFromFirestore(user, null);

    expect(result).toEqual({
      ...loadedData,
      budgetBooks: [{ id: 'default', displayLabel: 'Personal', isReadOnly: false }],
      currentBudgetBookId: 'default',
      currentBudgetBookIsReadOnly: false
    });
  });
});
