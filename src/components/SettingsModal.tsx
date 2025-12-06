import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DeleteAccountModal from './DeleteAccountModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deleteUserAccount: () => Promise<void>;
  isUk: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deleteUserAccount,
  isUk
}) => {
  const { t } = useTranslation();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
    onClose(); // Закриваємо попап налаштувань при відкритті попапу видалення
  };

  const handleDeleteModalClose = () => {
    setIsDeleteModalOpen(false);
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9998]"
        onClick={handleBackdropClick}
      >
        <div 
          className="bg-white w-full h-full sm:w-auto sm:h-auto sm:max-w-md sm:rounded-2xl shadow-2xl p-6 sm:p-8 border-0 sm:border-2 border-gray-200 sm:max-h-[90vh] overflow-y-auto" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4 flex items-center justify-center">
              <span className="mr-2 text-3xl sm:text-4xl">⚙️</span>
              {t('settings.title')}
            </h2>
          </div>

          <div className="space-y-4">
            {/* Опція видалення акаунта */}
            <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
              <h3 className="text-lg font-semibold text-red-700 mb-2">
                {t('settings.deleteAccount.dangerZone')}
              </h3>
              <p className="text-sm text-red-600 mb-4">
                {isUk 
                  ? 'Ця дія незворотна. Всі ваші дані будуть видалені назавжди.'
                  : 'This action is irreversible. All your data will be permanently deleted.'
                }
              </p>
              <button
                onClick={handleDeleteClick}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                {t('settings.deleteAccount.button')}
              </button>
            </div>
          </div>

          {/* Кнопка закриття */}
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-all"
            >
              {t('transaction.cancel')}
            </button>
          </div>
        </div>
      </div>

      {/* Модальне вікно видалення акаунту */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteModalClose}
        onConfirm={deleteUserAccount}
        isUk={isUk}
      />
    </>
  );
};

export default SettingsModal;

