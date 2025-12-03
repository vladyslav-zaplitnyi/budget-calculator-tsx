import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { handleError } from '../utils/errorHandler';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useAuth', action: 'loginWithGoogle' }
      );
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useAuth', action: 'logout' }
      );
      throw error;
    }
  }, []);

  return { user, loading, loginWithGoogle, logout };
}

