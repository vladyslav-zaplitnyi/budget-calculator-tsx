import { Day, Budgets, Budget } from '../types';

export const budgetActions = {
  SET_ACTIVE_BUDGET_ID: 'SET_ACTIVE_BUDGET_ID',
  SET_BUDGETS: 'SET_BUDGETS',
  UPDATE_BUDGET: 'UPDATE_BUDGET',
  ADD_BUDGET: 'ADD_BUDGET',
  DELETE_BUDGET: 'DELETE_BUDGET',
  SET_DAYS: 'SET_DAYS',
  UPDATE_DAY: 'UPDATE_DAY',
  RESET_DAYS: 'RESET_DAYS'
} as const;

export interface BudgetState {
  activeBudgetId: string;
  budgets: Budgets;
  days: Day[];
}

export type BudgetAction =
  | { type: typeof budgetActions.SET_ACTIVE_BUDGET_ID; payload: string }
  | { type: typeof budgetActions.SET_BUDGETS; payload: Budgets }
  | { type: typeof budgetActions.UPDATE_BUDGET; payload: { id: string; data: Partial<Budget> } }
  | { type: typeof budgetActions.ADD_BUDGET; payload: { id: string; budget: Budget } }
  | { type: typeof budgetActions.DELETE_BUDGET; payload: { budgetId: string; newActiveId?: string } }
  | { type: typeof budgetActions.SET_DAYS; payload: Day[] }
  | { type: typeof budgetActions.UPDATE_DAY; payload: { index: number; field: string; value: any } }
  | { type: typeof budgetActions.RESET_DAYS; payload: Day[] | undefined };

const initialState: BudgetState = {
  activeBudgetId: 'default',
  budgets: {},
  days: []
};

export function budgetReducer(state: BudgetState, action: BudgetAction): BudgetState {
  switch (action.type) {
    case budgetActions.SET_ACTIVE_BUDGET_ID:
      return {
        ...state,
        activeBudgetId: action.payload
      };
    
    case budgetActions.SET_BUDGETS:
      return {
        ...state,
        budgets: action.payload
      };
    
    case budgetActions.UPDATE_BUDGET:
      return {
        ...state,
        budgets: {
          ...state.budgets,
          [action.payload.id]: {
            ...state.budgets[action.payload.id],
            ...action.payload.data
          }
        }
      };
    
    case budgetActions.ADD_BUDGET:
      return {
        ...state,
        budgets: {
          ...state.budgets,
          [action.payload.id]: action.payload.budget
        },
        activeBudgetId: action.payload.id
      };
    
    case budgetActions.DELETE_BUDGET: {
      const { [action.payload.budgetId]: deleted, ...remainingBudgets } = state.budgets;
      return {
        ...state,
        budgets: remainingBudgets,
        activeBudgetId: action.payload.newActiveId || 'default'
      };
    }
    
    case budgetActions.SET_DAYS:
      return {
        ...state,
        days: action.payload
      };
    
    case budgetActions.UPDATE_DAY: {
      const newDays = [...state.days];
      newDays[action.payload.index] = {
        ...newDays[action.payload.index],
        [action.payload.field]: action.payload.value
      };
      return {
        ...state,
        days: newDays
      };
    }
    
    case budgetActions.RESET_DAYS:
      return {
        ...state,
        days: action.payload || []
      };
    
    default:
      return state;
  }
}

export function createBudgetInitialState(loadedData: unknown): BudgetState {
  // Type guard для перевірки структури даних
  const data = loadedData as Record<string, unknown> | null | undefined;
  return {
    ...initialState,
    activeBudgetId: (data && typeof data.activeBudgetId === 'string') ? data.activeBudgetId : initialState.activeBudgetId,
    budgets: (data && typeof data.budgets === 'object' && data.budgets !== null) ? data.budgets as Budgets : initialState.budgets,
    days: (data && Array.isArray(data.days)) ? data.days as Day[] : initialState.days
  };
}

