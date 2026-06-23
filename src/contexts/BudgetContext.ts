import { createContext, useContext } from 'react';
import { BudgetStateInterface } from '../hooks/useBudgetState';
import { User } from 'firebase/auth';

export interface BudgetStateWithSync extends BudgetStateInterface {
  syncStatus: string;
  setSyncStatus: (status: string) => void;
  getSyncStatusText: (key: string) => string;
  user: User | null;
}

export interface BudgetContextValue extends BudgetStateWithSync {
  handleUpdateNbuRates: () => Promise<void>;
  authLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteUserAccount: () => Promise<void>;
  /** Switch Firestore budget book for signed-in users. */
  switchBudgetBook: (bookId: string) => Promise<void>;
  isSwitchingBudgetBook: boolean;
  // Password modal props
  showPasswordModal?: boolean;
  handlePasswordSubmit?: (password: string) => void;
  passwordError?: string;
}

export const BudgetContext = createContext<BudgetContextValue | null>(null);

export const useBudgetContext = (): BudgetContextValue => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudgetContext must be used within BudgetProvider');
  }
  return context;
};

