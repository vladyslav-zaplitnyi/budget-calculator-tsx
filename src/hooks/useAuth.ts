import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User, deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { handleError } from '../utils/errorHandler';
import { saveToLocalStorage, createEmptyDefaultBudget } from '../utils/storageHelpers';
import { Budgets } from '../types';
import { deleteAllBudgetBooksForUser, ensureUserDocument } from '../services/budgetBooksFirestore';
import { ACTIVE_BUDGET_BOOK_COOKIE_KEY } from '../utils/constants';
import { withPopupOnFocusedScreen } from '../utils/authPopup';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          await ensureUserDocument(currentUser);
        }
      } catch (error) {
        handleError(
          error instanceof Error ? error : new Error(String(error)),
          { context: 'useAuth', action: 'ensureUserDocumentOnAuthStateChanged' }
        );
      } finally {
        if (isMounted) {
          setUser(currentUser);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    try {
      const result = await withPopupOnFocusedScreen(() => signInWithPopup(auth, googleProvider));
      await ensureUserDocument(result.user);
    } catch (error: any) {
      // Обробка помилок скасування входу користувачем - не показуємо помилку
      if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user') {
        // Користувач просто передумав - це нормальна поведінка, не обробляємо як помилку
        return;
      }
      
      // Для інших помилок обробляємо як звичайно
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        { context: 'useAuth', action: 'loginWithGoogle' }
      );
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    // КРОК 1: Виходимо з акаунту
    await signOut(auth);
    
    // КРОК 2: Тільки якщо крок 1 успішний - видаляємо budgetTrackerData та створюємо новий пустий
    // Чекаємо трохи, щоб переконатися, що signOut завершився
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Видаляємо budgetTrackerData з localStorage
    localStorage.removeItem('budgetTrackerData');
    
    // Створюємо новий пустий бюджет (як після натискання "стерти всі поля")
    // Використовуємо спільну функцію для дотримання DRY принципу
    const emptyBudgets = createEmptyDefaultBudget();
    
    // Переконуємося, що в emptyBudgets тільки один бюджет 'default'
    // Видаляємо всі інші бюджети, якщо вони є (на випадок помилки)
    const cleanedBudgets: Budgets = {
      'default': emptyBudgets['default']
    };
    
    // Зберігаємо новий пустий бюджет в localStorage
    saveToLocalStorage(cleanedBudgets, 'default');
    
    // Додаткова перевірка: переконуємося, що в localStorage завжди тільки один бюджет
    const verifyData = localStorage.getItem('budgetTrackerData');
    if (verifyData) {
      try {
        const parsed = JSON.parse(verifyData);
        if (parsed.budgets && Object.keys(parsed.budgets).length > 1) {
          // Якщо є більше одного бюджету, залишаємо тільки 'default'
          const fixedBudgets: Budgets = {
            'default': parsed.budgets['default'] || emptyBudgets['default']
          };
          saveToLocalStorage(fixedBudgets, 'default');
        }
      } catch (e) {
        // Якщо помилка парсингу, створюємо новий пустий бюджет
        saveToLocalStorage(cleanedBudgets, 'default');
      }
    }
    
    // Очищаємо інші дані користувача з localStorage
    // НЕ видаляємо мову - це налаштування користувача, не пов'язане з акаунтом
    // localStorage.removeItem('budgetTrackerLanguage'); // ЗАЛИШАЄМО МОВУ
    // localStorage.removeItem('language'); // Старий ключ - також залишаємо для зворотної сумісності
    localStorage.removeItem('displayCurrency');
    localStorage.removeItem('displayCurrencyIndex');
    localStorage.removeItem('nbu_rates_cache');
    localStorage.removeItem('app_errors');
    
    // Очищаємо cookies
    // НЕ видаляємо cookie з мовою - залишаємо налаштування користувача
    // document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = `${ACTIVE_BUDGET_BOOK_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    
    // Якщо signOut впав з помилкою, вона буде викинута автоматично
    // і не дійдемо до очищення localStorage
  }, []);

  const deleteUserAccount = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    const userId = currentUser.uid; // Зберігаємо UID перед видаленням

    try {
      // 1. Повторна авторизація ПЕРЕД будь-яким видаленням даних
      try {
        await withPopupOnFocusedScreen(() => reauthenticateWithPopup(currentUser, googleProvider));
      } catch (reauthError: any) {
        if (
          reauthError?.code === 'auth/cancelled-popup-request' ||
          reauthError?.code === 'auth/popup-closed-by-user'
        ) {
          const customError = new Error('REAUTH_CANCELLED');
          customError.name = 'ReauthCancelledError';
          throw customError;
        }
        throw reauthError;
      }

      // 2. Видаляємо всі книги бюджету з підколекції
      await deleteAllBudgetBooksForUser(userId);

      // 3. Видаляємо документ користувача з Firestore
      const userDocRef = doc(db, 'users', userId);
      await deleteDoc(userDocRef);

      // 4. Видаляємо користувача з Authentication
      await deleteUser(currentUser);

      // 5. Обов'язково виходимо з акаунту після видалення
      // Це запобігає автоматичному створенню нового акаунту
      await signOut(auth);
      
      // 6. Чекаємо трохи, щоб переконатися, що все завершилося
      await new Promise(resolve => setTimeout(resolve, 200));

      // 7. Очищаємо localStorage після підтвердження виходу
      localStorage.removeItem('budgetTrackerData');
      // НЕ видаляємо мову - це налаштування користувача, не пов'язане з акаунтом
      // localStorage.removeItem('budgetTrackerLanguage'); // ЗАЛИШАЄМО МОВУ
      // localStorage.removeItem('language'); // Старий ключ - також залишаємо
      localStorage.removeItem('displayCurrency');
      localStorage.removeItem('displayCurrencyIndex');
      localStorage.removeItem('nbu_rates_cache');
      localStorage.removeItem('app_errors');
      
      // Очищаємо cookies
      // НЕ видаляємо cookie з мовою - залишаємо налаштування користувача
      // document.cookie = 'budgetTrackerLanguage=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'budgetTrackerActiveBudgetId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = `${ACTIVE_BUDGET_BOOK_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    } catch (error: any) {
      if (error?.name === 'ReauthCancelledError' || error?.message === 'REAUTH_CANCELLED') {
        throw error;
      }

      // Обробка помилки requires-recent-login (запасний варіант після reauthenticateWithPopup)
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

