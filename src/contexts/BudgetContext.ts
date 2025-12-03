import { createContext, useContext } from 'react';
import { BudgetStateInterface } from '../hooks/useBudgetState';
import { User } from 'firebase/auth';

export interface BudgetStateWithSync extends BudgetStateInterface {
  syncStatus: string;
  setSyncStatus: (status: string) => void;
  getSyncStatusText: (key: string) => string;
}

export interface BudgetContextValue extends BudgetStateWithSync {
  handleUpdateNbuRates: () => Promise<void>;
  user: User | null;
  authLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

export const BudgetContext = createContext<BudgetContextValue | null>(null);

export const useBudgetContext = (): BudgetContextValue => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudgetContext must be used within BudgetProvider');
  }
  return context;
};

