import { budgetActions, budgetReducer, BudgetState } from './budgetReducer';
import { Budgets, Day } from '../types';

const createDaysWithTransaction = (): Day[] => [
  {
    day: 1,
    description: '',
    transactions: [
      {
        id: 'tx-1',
        type: 'income',
        amount: 100,
        currency: 'UAH',
        description: 'Saved before switch'
      }
    ]
  }
];

const createBudgets = (): Budgets => ({
  first: {
    name: 'First',
    startBalances: {},
    days: [],
    selectedCurrencies: ['UAH', 'USD', 'EUR'],
    exchangeRates: {}
  },
  second: {
    name: 'Second',
    startBalances: {},
    days: [],
    selectedCurrencies: ['UAH', 'USD', 'EUR'],
    exchangeRates: {}
  }
});

test('functional budget updates compose without losing saved transactions', () => {
  const initialState: BudgetState = {
    activeBudgetId: 'first',
    budgets: createBudgets(),
    days: createDaysWithTransaction()
  };

  const afterSavingCurrentBudget = budgetReducer(initialState, {
    type: budgetActions.SET_BUDGETS,
    payload: (prevBudgets) => ({
      ...prevBudgets,
      first: {
        ...prevBudgets.first,
        days: initialState.days
      }
    })
  });

  const afterPreparingNextBudget = budgetReducer(afterSavingCurrentBudget, {
    type: budgetActions.SET_BUDGETS,
    payload: (prevBudgets) => ({
      ...prevBudgets,
      second: {
        ...prevBudgets.second,
        name: 'Second renamed'
      }
    })
  });

  expect(afterPreparingNextBudget.budgets.first.days[0].transactions).toHaveLength(1);
  expect(afterPreparingNextBudget.budgets.second.name).toBe('Second renamed');
});
