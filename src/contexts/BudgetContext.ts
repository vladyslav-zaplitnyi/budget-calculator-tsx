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
  /** Create a second budget book (max 2) and switch to it. */
  createBook: (displayLabel: string) => Promise<void>;
  /** Rename a budget book label. */
  renameBook: (bookId: string, displayLabel: string) => Promise<void>;
  /** Delete a non-default budget book. */
  deleteBook: (bookId: string) => Promise<void>;
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

