import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getDaysInMonth } from '../utils/dateHelpers';
import { Day } from '../types';

interface MonthYearPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentYear: number;
  currentMonth: number;
  onApply: (year: number, month: number) => void;
  days: Day[];
}

const MonthYearPickerModal: React.FC<MonthYearPickerModalProps> = ({
  isOpen,
  onClose,
  currentYear,
  currentMonth,
  onApply,
  days
}) => {
  const { t } = useTranslation();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showWarning, setShowWarning] = useState(false);
  const [affectedDays, setAffectedDays] = useState<number[]>([]);

  // Оновлюємо вибрані значення при зміні поточних
  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
      setSelectedMonth(currentMonth);
      setShowWarning(false);
      setAffectedDays([]);
    }
  }, [isOpen, currentYear, currentMonth]);

  // Генеруємо роки (2020-2030)
  const years = Array.from({ length: 11 }, (_, i) => 2020 + i);

  // Отримуємо назви місяців з локалізації
  const monthNames = t('calendar.monthsLong', { returnObjects: true }) as string[];

  // Перевіряємо чи є заповнені дані у днях, які будуть приховані
  const checkForFilledDays = (year: number, month: number): number[] => {
    const newDaysInMonth = getDaysInMonth(year, month);
    const currentDaysInMonth = getDaysInMonth(currentYear, currentMonth);

    // Якщо новий місяць має більше або стільки ж днів - немає проблем
    if (newDaysInMonth >= currentDaysInMonth) {
      return [];
    }

    // Перевіряємо дні, які будуть приховані (від newDaysInMonth + 1 до currentDaysInMonth)
    const filled: number[] = [];
    for (let dayNum = newDaysInMonth + 1; dayNum <= currentDaysInMonth; dayNum++) {
      const dayIndex = dayNum - 1;
      const day = days[dayIndex];
      
      // Перевіряємо чи є транзакції або опис
      if (day && (
        (day.transactions && day.transactions.length > 0) ||
        (day.description && day.description.trim() !== '')
      )) {
        filled.push(dayNum);
      }
    }

    return filled;
  };

  const handleApplyClick = () => {
    // Перевіряємо чи змінилася дата
    if (selectedYear === currentYear && selectedMonth === currentMonth) {
      onClose();
      return;
    }

    // Перевіряємо чи є заповнені дні, які будуть приховані
    const filled = checkForFilledDays(selectedYear, selectedMonth);
    
    if (filled.length > 0) {
      setAffectedDays(filled);
      setShowWarning(true);
    } else {
      onApply(selectedYear, selectedMonth);
      onClose();
    }
  };

  const handleConfirmWithWarning = () => {
    onApply(selectedYear, selectedMonth);
    setShowWarning(false);
    setAffectedDays([]);
    onClose();
  };

  const handleCancelWarning = () => {
    setShowWarning(false);
    setAffectedDays([]);
    // Повертаємося до вибору місяця/року
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !showWarning) {
      onClose();
    }
  };

  // Якщо показуємо попередження
  if (showWarning) {
    const affectedDaysText =
      affectedDays.length > 0 ? [...affectedDays].sort((a, b) => a - b).join(', ') : '';

    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999]"
        onClick={handleBackdropClick}
      >
        <div 
          className="bg-white w-full h-full sm:w-auto sm:h-auto sm:max-w-2xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 border-0 sm:border-2 border-orange-200 sm:max-h-[90vh] overflow-y-auto flex flex-col justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-orange-600 mb-4 flex items-center justify-center">
              {t('monthYearPicker.warning.title')}
            </h2>
            <p className="text-base sm:text-lg text-gray-700 mb-2 text-center leading-relaxed">
              {t('monthYearPicker.warning.message')}
            </p>
            {affectedDaysText && (
              <p className="text-lg font-bold text-orange-600 text-center mb-4">
                {t('monthYearPicker.warning.messageWithDays', { days: affectedDaysText })}
              </p>
            )}
          </div>

          {/* Кнопки */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleCancelWarning}
              className="flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              {t('monthYearPicker.warning.cancelButton')}
            </button>
            <button
              type="button"
              onClick={handleConfirmWithWarning}
              className="flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg text-white bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 shadow-lg hover:shadow-xl active:scale-95 transition-all"
            >
              {t('monthYearPicker.warning.continueButton')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Основне модальне вікно вибору
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white w-full h-full sm:w-auto sm:h-auto sm:max-w-md sm:rounded-2xl shadow-2xl p-6 sm:p-8 border-0 sm:border-2 border-indigo-200 sm:max-h-[90vh] overflow-y-auto flex flex-col justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600 mb-6 text-center">
            📅 {t('monthYearPicker.title')}
          </h2>

          {/* Селектор місяця */}
          <div className="mb-6">
            <label className="block text-base sm:text-lg font-semibold text-gray-700 mb-3">
              {t('monthYearPicker.month')}
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold text-gray-900 bg-white"
            >
              {monthNames.map((name, index) => (
                <option key={index} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Селектор року */}
          <div className="mb-6">
            <label className="block text-base sm:text-lg font-semibold text-gray-700 mb-3">
              {t('monthYearPicker.year')}
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold text-gray-900 bg-white"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            {t('monthYearPicker.cancel')}
          </button>
          <button
            type="button"
            onClick={handleApplyClick}
            className="flex-1 py-4 px-6 rounded-lg font-bold text-base sm:text-lg text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-lg hover:shadow-xl active:scale-95 transition-all"
          >
            {t('monthYearPicker.apply')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonthYearPickerModal;

