import React from 'react';
import { createPortal } from 'react-dom';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  buttonText?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  buttonText,
  type = 'info'
}) => {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success':
        return 'bg-emerald-500 hover:bg-emerald-600';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600';
      case 'error':
        return 'bg-rose-500 hover:bg-rose-600';
      default:
        return 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600';
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full mx-4 border-2 border-gray-200 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2 text-2xl">{getIcon()}</span> {title}
          </h2>
        )}
        
        <p className={`text-sm sm:text-base ${title ? 'text-gray-600' : 'text-gray-800'} mb-6 ${!title ? 'flex items-center' : ''}`}>
          {!title && <span className="mr-2 text-xl">{getIcon()}</span>}
          {message}
        </p>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-3 rounded-lg font-semibold text-white transition-all ${getButtonColor()}`}
          >
            {buttonText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default AlertModal;

