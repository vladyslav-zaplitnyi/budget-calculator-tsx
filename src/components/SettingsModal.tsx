import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from 'firebase/auth';
import DeleteAccountModal from './DeleteAccountModal';
import PasswordModal from './PasswordModal';
import InfoTip from './InfoTip';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deleteUserAccount: () => Promise<void>;
  isUk: boolean;
  user: User | null;
  isEncrypted?: boolean;
  handleEnableEncryptionClick?: () => void;
  handleDisableEncryptionClick?: () => void;
  handleEnableEncryption?: (password: string, confirmPassword: string) => void;
  handleDisableEncryption?: (password: string) => void;
  showEnableEncryptionModal?: boolean;
  showDisableEncryptionModal?: boolean;
  setShowEnableEncryptionModal?: (show: boolean) => void;
  setShowDisableEncryptionModal?: (show: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deleteUserAccount,
  isUk,
  user,
  isEncrypted = false,
  handleEnableEncryptionClick,
  handleDisableEncryptionClick,
  handleEnableEncryption,
  handleDisableEncryption,
  showEnableEncryptionModal = false,
  showDisableEncryptionModal = false,
  setShowEnableEncryptionModal,
  setShowDisableEncryptionModal
}) => {
  const { t } = useTranslation();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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

  const handleEnableEncryptionClickWrapper = () => {
    onClose(); // Закриваємо вікно налаштувань
    handleEnableEncryptionClick?.(); // Відкриваємо модальне вікно шифрування
  };

  const handleDisableEncryptionClickWrapper = () => {
    onClose(); // Закриваємо вікно налаштувань
    handleDisableEncryptionClick?.(); // Відкриваємо модальне вікно вимкнення шифрування
  };

  return (
    <>
      {/* Вікно налаштувань - рендериться тільки якщо isOpen === true */}
      {isOpen && (
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
              {/* Security Section - тільки для авторизованих користувачів */}
              {user && (
                <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-4 sm:p-6 rounded-xl border-2 border-amber-200">
                  <h3 className="text-sm sm:text-base font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                    <span className="mr-2">🔒</span> {t('settings.security.title')}
                    <InfoTip text={t('infoTips.security')} />
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-4">
                    {t('settings.security.description')}
                  </p>
                  
                  {!isEncrypted ? (
                    <button
                      onClick={handleEnableEncryptionClickWrapper}
                      className="w-full px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-xl active:scale-95"
                    >
                      🔒 {t('settings.security.enable')}
                    </button>
                  ) : (
                    <button
                      onClick={handleDisableEncryptionClickWrapper}
                      className="w-full px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white shadow-lg hover:shadow-xl active:scale-95"
                    >
                      🔓 {t('settings.security.disable')}
                    </button>
                  )}
                </div>
              )}

              {/* Опція видалення акаунта */}
              <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <h3 className="text-lg font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  {t('settings.deleteAccount.dangerZone')}
                  <InfoTip text={t('infoTips.deleteAccount')} />
                </h3>
                <p className="text-sm text-red-600 mb-4">
                  {t('settings.deleteAccount.irreversible')}
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
      )}

      {/* Модальне вікно видалення акаунту - рендериться незалежно від isOpen */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteModalClose}
        onConfirm={deleteUserAccount}
      />

      {/* Модальні вікна для шифрування - рендеряться незалежно від isOpen */}
      <PasswordModal
        isOpen={showEnableEncryptionModal}
        onClose={() => setShowEnableEncryptionModal?.(false)}
        onConfirm={() => {}}
        onConfirmPassword={handleEnableEncryption}
        title={t('encryption.enable.title')}
        message={t('encryption.enable.message')}
        confirmButtonText={t('encryption.enable.confirm')}
        cancelButtonText={t('encryption.enable.cancel')}
        isConfirmPassword={true}
      />
      
      <PasswordModal
        isOpen={showDisableEncryptionModal}
        onClose={() => setShowDisableEncryptionModal?.(false)}
        onConfirm={handleDisableEncryption || (() => {})}
        title={t('encryption.disable.title')}
        message={t('encryption.disable.message')}
        confirmButtonText={t('encryption.disable.confirm')}
        cancelButtonText={t('encryption.disable.cancel')}
      />
    </>
  );
};

export default SettingsModal;

