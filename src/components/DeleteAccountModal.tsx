import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AlertModal from './AlertModal';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isUk: boolean;
}

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isUk
}) => {
  const { t } = useTranslation();
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const requiredText = isUk ? 'ВИДАЛИТИ' : 'DELETE';
  const isConfirmEnabled = confirmationText === requiredText && !isDeleting;

  const handleConfirm = async () => {
    if (!isConfirmEnabled) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm();
      // Показуємо повідомлення про успіх
      setShowSuccessModal(true);
      // Оновлюємо сторінку через короткий час, щоб користувач побачив повідомлення
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      if (err?.name === 'RequiresRecentLoginError' || err?.message === 'REQUIRES_RECENT_LOGIN') {
        setError(t('settings.deleteAccount.requiresRecentLogin'));
      } else {
        setError(t('settings.deleteAccount.error'));
      }
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return; // Не закриваємо під час видалення
    setConfirmationText('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isDeleting) {
      handleClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white w-full h-full sm:w-auto sm:h-auto sm:max-w-2xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 border-0 sm:border-2 border-red-200 sm:max-h-[90vh] overflow-y-auto flex flex-col justify-center" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-red-600 mb-4 flex items-center justify-center">
            <span className="mr-2 text-3xl sm:text-4xl">⚠️</span>
            {t('settings.deleteAccount.title')}
          </h2>
          <p className="text-base sm:text-lg text-gray-700 mb-6 text-center leading-relaxed">
            {t('settings.deleteAccount.warning')}
          </p>
        </div>

        {/* Input для підтвердження */}
        <div className="mb-6">
          <label className="block text-base sm:text-lg font-semibold text-gray-700 mb-3 text-center">
            {isUk 
              ? `Введіть "ВИДАЛИТИ" для підтвердження:`
              : `Type "DELETE" to confirm:`
            }
          </label>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={requiredText}
            disabled={isDeleting}
            className={`w-full px-6 py-4 text-lg border-2 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-center font-semibold text-gray-900 ${
              isDeleting 
                ? 'bg-gray-100 border-gray-300 cursor-not-allowed text-gray-500' 
                : confirmationText === requiredText
                ? 'border-red-500 bg-red-50 text-gray-900'
                : 'border-gray-300 text-gray-900'
            }`}
            autoFocus
          />
        </div>

        {/* Помилка */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border-2 border-red-300 rounded-lg">
            <p className="text-base text-red-700 font-semibold text-center">{error}</p>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className={`flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg transition-colors ${
              isDeleting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {t('transaction.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={`flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg text-white transition-all ${
              isConfirmEnabled
                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-xl active:scale-95'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isDeleting 
              ? t('settings.deleteAccount.deleting')
              : t('settings.deleteAccount.confirmButton')
            }
          </button>
        </div>
      </div>
      
      <AlertModal
        isOpen={showSuccessModal}
        onClose={() => {}}
        message={t('settings.deleteAccount.success')}
        type="success"
        buttonText={isUk ? 'OK' : 'OK'}
      />
    </div>
  );
};

export default DeleteAccountModal;

