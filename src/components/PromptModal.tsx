import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  required?: boolean;
  maxLength?: number;
}

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmButtonText,
  cancelButtonText,
  required = true,
  maxLength
}) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Фокус на інпут після відкриття модального вікна
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, defaultValue]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!required || value.trim()) {
      onConfirm(value.trim());
      onClose();
    }
  };

  const handleCancel = () => {
    setValue(defaultValue);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full mx-4 border-2 border-gray-200 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">💬</span> {title}
        </h2>
        
        {message && (
          <p className="text-sm sm:text-base text-gray-600 mb-4">{message}</p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              required={required}
              autoFocus
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-3 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
            >
              {cancelButtonText || 'Скасувати'}
            </button>
            <button
              type="submit"
              disabled={required && !value.trim()}
              className="flex-1 px-4 py-3 rounded-lg font-semibold bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {confirmButtonText || 'Підтвердити'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PromptModal;


