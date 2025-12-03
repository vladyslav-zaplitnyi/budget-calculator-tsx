import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
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
      // Спочатку виходимо з акаунту
      await signOut(auth);
      
      // Після успішного виходу очищаємо localStorage
      // Чекаємо трохи, щоб переконатися, що signOut завершився
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Очищаємо всі дані користувача з localStorage
      localStorage.removeItem('budgetTrackerData');
      localStorage.removeItem('budgetTrackerLanguage');
      localStorage.removeItem('displayCurrency');
      localStorage.removeItem('displayCurrencyIndex');
      localStorage.removeItem('nbu_rates_cache');
      localStorage.removeItem('app_errors');
      
      // Очищаємо cookies
      document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    } catch (error) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useAuth', action: 'logout' }
      );
      throw error;
    }
  }, []);

  const deleteUserAccount = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    const userId = currentUser.uid; // Зберігаємо UID перед видаленням

    try {
      // 1. Видаляємо документ користувача з Firestore
      const userDocRef = doc(db, 'users', userId);
      await deleteDoc(userDocRef);

      // 2. Видаляємо користувача з Authentication
      await deleteUser(currentUser);

      // 3. Обов'язково виходимо з акаунту після видалення
      // Це запобігає автоматичному створенню нового акаунту
      await signOut(auth);
      
      // 4. Чекаємо трохи, щоб переконатися, що все завершилося
      await new Promise(resolve => setTimeout(resolve, 200));

      // 5. Очищаємо localStorage після підтвердження виходу
      localStorage.removeItem('budgetTrackerData');
      localStorage.removeItem('budgetTrackerLanguage');
      localStorage.removeItem('displayCurrency');
      localStorage.removeItem('displayCurrencyIndex');
      localStorage.removeItem('nbu_rates_cache');
      localStorage.removeItem('app_errors');
      
      // Очищаємо cookies
      document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    } catch (error: any) {
      // Обробка помилки requires-recent-login
      if (error?.code === 'auth/requires-recent-login') {
        const customError = new Error('REQUIRES_RECENT_LOGIN');
        customError.name = 'RequiresRecentLoginError';
        throw customError;
      }
      
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useAuth', action: 'deleteUserAccount' }
      );
      throw error;
    }
  }, []);

  return { user, loading, loginWithGoogle, logout, deleteUserAccount };
}

