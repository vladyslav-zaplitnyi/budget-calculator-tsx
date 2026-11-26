import React from 'react';
import { render, act } from '@testing-library/react';
import { useSyncDebounce } from './useSyncDebounce';
import { saveToFirestore } from '../utils/storageHelpers';

jest.mock('../utils/storageHelpers', () => ({
  saveToFirestore: jest.fn()
}));

const mockedSave = saveToFirestore as jest.Mock;

const budget = {
  name: 'Test',
  startBalances: {},
  selectedCurrencies: ['UAH'],
  exchangeRates: {},
  days: [],
  displayCurrency: 'UAH',
  displayCurrencyIndex: 0,
  budgetDate: { year: 2026, month: 0 }
};

function Harness(props: ReturnType<typeof baseProps>) {
  useSyncDebounce(props);
  return null;
}

function baseProps(): any {
  return {
    budgets: { default: budget },
    activeBudgetId: 'default',
    user: { uid: 'test-user' },
    isInitialLoad: false,
    authLoading: false,
    latestDataRef: {
      current: { selectedCurrencies: ['UAH'], exchangeRates: {}, days: [] }
    },
    setSyncStatus: jest.fn(),
    getSyncStatusText: (key: string) => key,
    encryptionPassword: null,
    setIsEncrypted: jest.fn(),
    isRemoteDataEncrypted: false,
    isDataLoaded: false,
    firestoreBudgetContext: { budgetBookId: 'default', isReadOnly: false }
  };
}

const flushDebounce = () =>
  act(() => {
    jest.advanceTimersByTime(2500);
  });

describe('useSyncDebounce write guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('не пише, поки дані з Firestore не завантажені', () => {
    render(<Harness {...baseProps()} />);
    flushDebounce();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('не пише поверх зашифрованих даних без пароля', () => {
    render(<Harness {...baseProps()} isDataLoaded isRemoteDataEncrypted />);
    flushDebounce();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('не пише в книгу лише для читання', () => {
    render(
      <Harness
        {...baseProps()}
        isDataLoaded
        firestoreBudgetContext={{ budgetBookId: 'book', isReadOnly: true }}
      />
    );
    flushDebounce();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('пише один раз після debounce, коли всі перевірки пройдено', () => {
    render(<Harness {...baseProps()} isDataLoaded />);
    flushDebounce();
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it('дозберігає зміни в попередню книгу при її перемиканні', () => {
    const { rerender } = render(
      <Harness
        {...baseProps()}
        isDataLoaded
        firestoreBudgetContext={{ budgetBookId: 'book-a', isReadOnly: false }}
      />
    );

    // Ще не минув debounce — зміни лише в памʼяті
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockedSave).not.toHaveBeenCalled();

    rerender(
      <Harness
        {...baseProps()}
        isDataLoaded
        firestoreBudgetContext={{ budgetBookId: 'book-b', isReadOnly: false }}
      />
    );

    expect(mockedSave).toHaveBeenCalledTimes(1);
    // Запис пішов саме в стару книгу
    expect(mockedSave.mock.calls[0][8]).toEqual({ budgetBookId: 'book-a', isReadOnly: false });
  });
});
