import React, { useMemo, useCallback, ReactNode, useState, useEffect } from 'react';
import { BudgetContext, BudgetContextValue, BudgetStateWithSync } from '../contexts/BudgetContext';
import { useBudgetState } from '../hooks/useBudgetState';
import { useBudgetSync } from '../hooks/useBudgetSync';
import { useCurrencyRates } from '../hooks/useCurrencyRates';
import { useAuth } from '../hooks/useAuth';
import { translate } from '../i18n/config';
import PasswordModal from './PasswordModal';
import DeleteAccountModal from './DeleteAccountModal';
import AlertModal from './AlertModal';

interface BudgetProviderProps {
  children: ReactNode;
}

export function BudgetProvider({ children }: BudgetProviderProps) {
  const budgetState = useBudgetState();
  const { user, loading: authLoading, loginWithGoogle, logout: logoutFromAuth, deleteUserAccount } = useAuth();
  
  // Обгортка для logout з м'яким скиданням стану
  const logout = useCallback(async () => {
    try {
      // КРОК 1: Викликаємо logout з useAuth (видаляє budgetTrackerData і створює новий пустий)
      await logoutFromAuth();
      
      // КРОК 2: Тільки якщо крок 1 успішний
      // Викликаємо resetToDefaults для м'якого скидання стану React компонентів
      budgetState.resetToDefaults();
      
      // КРОК 3: Перезавантажуємо сторінку для гарантованого чистого стану
      // Це гарантує, що всі дані очищені і завантажуються тільки новий пустий бюджет
      window.location.reload();
    } catch (error) {
      // КРОК 4: Обробка помилок - НЕ очищаємо дані, показуємо повідомлення про помилку
      setAlertMessage(translate('header.logoutError'));
      setShowAlertModal(true);
      // Прокидаємо помилку далі, щоб обробник знав про невдачу
      throw error;
    }
  }, [logoutFromAuth, budgetState]);
  
  // Функція для отримання тексту статусу синхронізації
  const getSyncStatusText = useCallback((statusType: string) => {
    switch (statusType) {
      case 'saved':
        return translate('syncStatus.saved');
      case 'error':
        return translate('syncStatus.error');
      case 'syncing':
        return translate('syncStatus.syncing');
      case 'local':
      default:
        return translate('syncStatus.local');
    }
  }, []);

  // Ініціалізуємо статус синхронізації
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatusText('local'));
  
  // Додаємо syncStatus до budgetState (мемоізуємо для стабільності)
  const budgetStateWithSync: BudgetStateWithSync = useMemo(() => ({
    ...budgetState,
    syncStatus,
    setSyncStatus,
    getSyncStatusText
  }), [budgetState, syncStatus, getSyncStatusText]);

  // Використовуємо синхронізацію
  const { showPasswordModal, passwordError, handlePasswordSubmit, handlePasswordCancel: originalHandlePasswordCancel } = useBudgetSync(budgetStateWithSync, getSyncStatusText, user, authLoading);
  
  // Обгортка для handlePasswordCancel з автоматичним виходом
  const handlePasswordCancel = useCallback(async () => {
    originalHandlePasswordCancel();
    // Автоматично виконуємо вихід при скасуванні
    if (user) {
      try {
        await logout();
      } catch (error) {
        // Помилка вже обробляється в logout
        console.error('Помилка при виході після скасування:', error);
      }
    }
  }, [originalHandlePasswordCancel, user, logout]);

  // Стан для модального вікна видалення акаунта
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  // Стан для AlertModal
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Обробник для відкриття модального вікна видалення акаунта
  const handleDeleteAccountClick = useCallback(() => {
    setIsDeleteAccountModalOpen(true);
  }, []);

  // Обробник для закриття модального вікна видалення акаунта
  const handleDeleteAccountModalClose = useCallback(() => {
    setIsDeleteAccountModalOpen(false);
  }, []);
  
  // Використовуємо курси валют
  const currencyRates = useCurrencyRates(budgetStateWithSync);

  // Оновлюємо текст статусу синхронізації при зміні мови
  // Використовуємо емодзі для визначення типу статусу (не залежить від мови)
  useEffect(() => {
    let statusType = 'local';
    if (syncStatus.includes('☁️')) {
      statusType = 'saved';
    } else if (syncStatus.includes('❌')) {
      statusType = 'error';
    } else if (syncStatus.includes('⏳')) {
      statusType = 'syncing';
    } else {
      statusType = 'local';
    }
    setSyncStatus(getSyncStatusText(statusType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetState.language, getSyncStatusText]);

  // Мемоізуємо value для контексту, щоб уникнути зайвих ререндерів
  const value: BudgetContextValue = useMemo(() => ({
    ...budgetStateWithSync,
    ...currencyRates,
    user,
    authLoading,
    loginWithGoogle,
    logout,
    deleteUserAccount,
    showPasswordModal,
    handlePasswordSubmit,
    passwordError
  }), [budgetStateWithSync, currencyRates, user, authLoading, loginWithGoogle, logout, deleteUserAccount, showPasswordModal, handlePasswordSubmit, passwordError]);

  return (
    <BudgetContext.Provider value={value}>
      {children}
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={handlePasswordCancel}
        onConfirm={handlePasswordSubmit}
        title={translate('encryption.unlock.title')}
        message={translate('encryption.unlock.message')}
        confirmButtonText={translate('encryption.unlock.confirmButton')}
        cancelButtonText={translate('encryption.unlock.cancelButton')}
        errorMessage={passwordError}
        onDeleteAccountClick={user ? handleDeleteAccountClick : undefined}
      />
      <DeleteAccountModal
        isOpen={isDeleteAccountModalOpen}
        onClose={handleDeleteAccountModalClose}
        onConfirm={deleteUserAccount}
      />
      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        message={alertMessage}
        type="error"
        buttonText={translate('common.ok')}
      />
    </BudgetContext.Provider>
  );
}

