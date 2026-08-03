import React from 'react';
import { createPortal } from 'react-dom';
import { translate } from '../i18n/config';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOverwrite: () => void;
  savedAt: string | null;
  budgetName: string;
}

const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onOverwrite,
  savedAt,
  budgetName
}) => {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const formattedDate = savedAt 
    ? new Date(savedAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : translate('importModal.unknownDate');

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-lg w-full mx-4 border-2 border-indigo-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">📥</span> {translate('importModal.title')}
        </h2>
        
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm sm:text-base text-gray-700 mb-2">
            <strong>{translate('importModal.fileLabel')}</strong> {budgetName}
          </p>
          <p className="text-sm sm:text-base text-gray-700">
            <strong>{translate('importModal.savedAtLabel')}</strong> {formattedDate}
          </p>
        </div>

        <p className="text-sm sm:text-base text-gray-600 mb-6">
          {translate('importModal.selectAction')}
        </p>

        <div className="flex flex-col gap-3 mb-4">
          <button
            type="button"
            onClick={onOverwrite}
            className="w-full px-4 py-3 rounded-lg font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-all shadow-md hover:shadow-lg text-left"
          >
            <div className="flex items-center">
              <span className="mr-2">🔄</span>
              <span>{translate('importModal.overwrite')}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-3 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
          >
            ❌ {translate('importModal.cancel')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ImportModal;
