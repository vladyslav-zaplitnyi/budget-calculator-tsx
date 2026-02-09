import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
import i18n from '../i18n/config';
import SettingsModal from './SettingsModal';
import CurrencyFlag from './CurrencyFlag';
import MonthYearPickerModal from './MonthYearPickerModal';
import { getMonthYearLabel } from '../utils/dateHelpers';
import { Day } from '../types';

interface HeaderProps {
  isUk: boolean;
  syncStatus: string;
  authLoading: boolean;
  user: User | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  language: string;
  setLanguage: (lang: string) => void;
  deleteUserAccount: () => Promise<void>;
  // Encryption props
  isEncrypted?: boolean;
  encryptionPassword?: string | null;
  setEncryptionPassword?: (password: string | null) => void;
  handlePasswordSubmit?: (password: string) => void;
  showPasswordModal?: boolean;
  passwordError?: string;
  // Encryption handlers
  handleEnableEncryptionClick?: () => void;
  handleDisableEncryptionClick?: () => void;
  handleEnableEncryption?: (password: string, confirmPassword: string) => void;
  handleDisableEncryption?: (password: string) => void;
  showEnableEncryptionModal?: boolean;
  showDisableEncryptionModal?: boolean;
  setShowEnableEncryptionModal?: (show: boolean) => void;
  setShowDisableEncryptionModal?: (show: boolean) => void;
  // Budget date
  budgetYear?: number;
  budgetMonth?: number;
  setBudgetDate?: (date: { year: number; month: number }) => void;
  days?: Day[];
}

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const getSyncStatusTitle = (syncStatus: string) => {
  // Використовуємо емодзі для визначення типу статусу (не залежить від мови)
  if (syncStatus.includes('☁️')) {
    return translate('header.syncStatus.saved');
  }
  if (syncStatus.includes('❌')) {
    return translate('header.syncStatus.error');
  }
  if (syncStatus.includes('⏳')) {
    return translate('header.syncStatus.syncing');
  }
  // За замовчуванням - локальний статус
  return translate('header.syncStatus.local');
};

const Header: React.FC<HeaderProps> = ({
  isUk,
  syncStatus,
  authLoading,
  user,
  loginWithGoogle,
  logout,
  language,
  setLanguage,
  deleteUserAccount,
  isEncrypted = false,
  encryptionPassword,
  setEncryptionPassword,
  handlePasswordSubmit,
  showPasswordModal = false,
  passwordError,
  handleEnableEncryptionClick,
  handleDisableEncryptionClick,
  handleEnableEncryption,
  handleDisableEncryption,
  showEnableEncryptionModal = false,
  showDisableEncryptionModal = false,
  setShowEnableEncryptionModal,
  setShowDisableEncryptionModal,
  budgetYear,
  budgetMonth,
  setBudgetDate,
  days = []
}) => {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMonthYearPickerOpen, setIsMonthYearPickerOpen] = useState(false);
  const { t } = useTranslation();
  
  // Форматуємо дату бюджету для відображення
  const budgetMonthLabel = budgetYear !== undefined && budgetMonth !== undefined
    ? getMonthYearLabel(language, budgetYear, budgetMonth)
    : null;

  const handleTodayClick = () => {
    if (!setBudgetDate) return;
    const now = new Date();
    setBudgetDate({ year: now.getFullYear(), month: now.getMonth() });
  };

  const handleMonthYearBadgeClick = () => {
    if (setBudgetDate) {
      setIsMonthYearPickerOpen(true);
    }
  };

  const handleMonthYearApply = (year: number, month: number) => {
    if (setBudgetDate) {
      setBudgetDate({ year, month });
    }
  };

  return (
    <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6 text-white relative overflow-hidden">
      {/* Subtle animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent pointer-events-none" style={{ backgroundSize: '200% 100%', animation: 'shimmer 4s ease-in-out infinite' }} />
      
      {/* Десктоп / планшет: заголовок зліва, панель дій справа */}
      <div className="hidden md:flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-6 mb-3 relative z-10">
        {/* Брендинг + заголовок */}
        <div className="flex flex-col gap-1 w-full lg:w-auto text-center lg:text-left">
          <span className="inline-flex items-center justify-center lg:justify-start text-[11px] uppercase tracking-[0.18em] text-indigo-100/90">
            <span className="mr-1">💰</span>
            {t('header.subtitle')}
          </span>
          <h1 className="text-2xl lg:text-3xl xl:text-4xl font-extrabold leading-tight samsung-white-text shimmer-text">
            {t('header.title')}
          </h1>
          <p className="text-center lg:text-left text-indigo-100 text-sm sm:text-base mt-1 samsung-white-text">
            {t('header.description')}
          </p>
          {budgetMonthLabel && (
            <div className="inline-flex items-center justify-center lg:justify-start gap-2 mt-2">
              <div 
                className={`inline-flex items-center justify-center lg:justify-start gap-1.5 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/20 shadow-sm ${setBudgetDate ? 'cursor-pointer hover:bg-white/25 transition-all' : 'cursor-help'}`}
                title={t('settings.budgetMonth.tooltip')}
                onClick={handleMonthYearBadgeClick}
              >
                <span className="text-xs font-medium text-white/90">📅</span>
                <span className="text-xs sm:text-sm font-semibold text-white">
                  {budgetMonthLabel}
                </span>
              </div>
              {setBudgetDate && (
                <button
                  type="button"
                  onClick={handleTodayClick}
                  className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-800 px-3 py-1.5 rounded-full shadow-lg border border-white/30 transition-all text-xs sm:text-sm font-semibold"
                >
                  {t('header.today')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Контейнер: статус, авторизація, мова */}
        <div className="flex items-center justify-center lg:justify-end w-full lg:w-auto lg:flex-1">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 lg:gap-3 bg-white/10 backdrop-blur-xl rounded-full px-3 sm:px-4 py-2 shadow-lg border border-white/20">
            {/* Статус синхронізації */}
            <div
              className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold bg-black/20 px-2 py-1 rounded-full whitespace-nowrap"
              title={getSyncStatusTitle(syncStatus)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span>{syncStatus}</span>
            </div>

            {/* Тонка роздільна лінія */}
            <span className="hidden xl:block h-6 w-px bg-white/25" />

            {/* Авторизація */}
            {authLoading ? (
              <div className="text-[11px] sm:text-xs text-blue-50">
                {t('header.loading')}
              </div>
            ) : user ? (
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-white/70 shadow-sm object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full border border-white/70 shadow-sm bg-blue-500/50 flex items-center justify-center text-white text-xs font-semibold">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="flex flex-col mr-1">
                  <span className="text-[11px] font-semibold leading-tight">
                    {user.displayName || user.email}
                  </span>
                  <span className="text-[10px] text-blue-100/80">
                    {t('header.signedIn')}
                  </span>
                </div>
                {!(showPasswordModal && user) && (
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="text-[11px] sm:text-xs font-semibold bg-white/95 hover:bg-white text-slate-800 px-3 py-1 rounded-full shadow-lg border border-white/30 transition-all"
                    title={t('settings.title')}
                  >
                    ⚙️
                  </button>
                )}
                <button
                  onClick={logout}
                  className="text-[11px] sm:text-xs font-semibold bg-red-500/90 hover:bg-red-600 px-2.5 py-1 rounded-full shadow-sm transition-all"
                >
                  {t('header.logout')}
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="text-[11px] sm:text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-sm"
              >
                <GoogleIcon />
                {t('header.signIn')}
              </button>
            )}

            {/* Тонка роздільна лінія */}
            <span className="hidden xl:block h-6 w-px bg-white/25" />

            {/* Перемикач мови */}
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="hidden xl:inline text-[11px] font-medium text-blue-100/90">
                {t('header.language')}
              </span>
              <div className="inline-flex items-center bg-slate-900/40 rounded-full p-0.5 shadow-inner border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage('uk');
                    setLanguage('uk');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap ${
                    i18n.language === 'uk'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <CurrencyFlag currencyCode="uk" size={14} />
                  <span className="hidden sm:inline">Укр</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage('en');
                    setLanguage('en');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap ${
                    i18n.language === 'en'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <CurrencyFlag currencyCode="USD" size={14} />
                  <span className="hidden sm:inline">Eng</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Мобільні екрани: заголовок і панель дій в один компактний блок */}
      <div className="flex md:hidden flex-col gap-3 mb-3 relative z-10">
        <div className="flex flex-col items-center text-center gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-indigo-100/90">
            {t('header.subtitle')}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight samsung-white-text shimmer-text">
            {t('header.title')}
          </h1>
          <p className="text-center text-indigo-100 text-sm sm:text-base mt-1 samsung-white-text">
            {t('header.description')}
          </p>
          {budgetMonthLabel && (
            <div className="inline-flex items-center justify-center gap-2 mt-2">
              <div 
                className={`inline-flex items-center justify-center gap-1.5 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/20 shadow-sm ${setBudgetDate ? 'cursor-pointer hover:bg-white/25 transition-all' : 'cursor-help'}`}
                title={t('settings.budgetMonth.tooltip')}
                onClick={handleMonthYearBadgeClick}
              >
                <span className="text-xs font-medium text-white/90">📅</span>
                <span className="text-xs sm:text-sm font-semibold text-white">
                  {budgetMonthLabel}
                </span>
              </div>
              {setBudgetDate && (
                <button
                  type="button"
                  onClick={handleTodayClick}
                  className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-800 px-3 py-1.5 rounded-full shadow-lg border border-white/30 transition-all text-xs sm:text-sm font-semibold"
                >
                  {t('header.today')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white/10 backdrop-blur-xl rounded-2xl px-3 py-2 shadow-lg border border-white/20">
            {/* Статус синхронізації */}
            <div
              className="flex items-center gap-1 text-[11px] font-semibold bg-black/20 px-2 py-1 rounded-full"
              title={getSyncStatusTitle(syncStatus)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span className="truncate max-w-[140px]">{syncStatus}</span>
            </div>

            {/* Перемикач мови */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-indigo-100/90">
                {t('header.languageShort')}
              </span>
              <div className="inline-flex items-center bg-slate-900/40 rounded-full p-0.5 shadow-inner border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage('uk');
                    setLanguage('uk');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                    i18n.language === 'uk'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <CurrencyFlag currencyCode="uk" size={14} />
                  <span>Укр</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    i18n.changeLanguage('en');
                    setLanguage('en');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                    i18n.language === 'en'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <CurrencyFlag currencyCode="USD" size={14} />
                  <span>Eng</span>
                </button>
              </div>
            </div>
          </div>

          {/* Авторизація */}
          <div className="flex items-center justify-center">
            {authLoading ? (
              <div className="text-xs sm:text-sm text-blue-100">
                {t('header.loading')}
              </div>
            ) : user ? (
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xl rounded-full px-3 sm:px-4 py-1.5 w-full sm:w-auto justify-center shadow-lg border border-white/20">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-white/70 object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full border border-white/70 bg-indigo-500/50 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]">
                  {user.displayName || user.email}
                </span>
                {!(showPasswordModal && user) && (
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="text-[11px] sm:text-xs font-semibold bg-white/95 hover:bg-white text-slate-800 px-3 py-1 rounded-full shadow-lg border border-white/30 transition-all flex-shrink-0"
                    title={t('settings.title')}
                  >
                    ⚙️
                  </button>
                )}
                <button
                  onClick={logout}
                  className="text-[11px] sm:text-xs font-semibold bg-red-500/90 hover:bg-red-600 px-2.5 sm:px-3 py-1 rounded-full transition-all flex-shrink-0 whitespace-nowrap"
                >
                  {t('header.logout')}
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="text-xs sm:text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-lg"
              >
                <GoogleIcon />
                {t('header.signIn')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Модальне вікно налаштувань */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        deleteUserAccount={deleteUserAccount}
        isUk={isUk}
        user={user}
        isEncrypted={isEncrypted}
        handleEnableEncryptionClick={handleEnableEncryptionClick}
        handleDisableEncryptionClick={handleDisableEncryptionClick}
        handleEnableEncryption={handleEnableEncryption}
        handleDisableEncryption={handleDisableEncryption}
        showEnableEncryptionModal={showEnableEncryptionModal}
        showDisableEncryptionModal={showDisableEncryptionModal}
        setShowEnableEncryptionModal={setShowEnableEncryptionModal}
        setShowDisableEncryptionModal={setShowDisableEncryptionModal}
      />

      {/* Модальне вікно вибору місяця/року */}
      {budgetYear !== undefined && budgetMonth !== undefined && (
        <MonthYearPickerModal
          isOpen={isMonthYearPickerOpen}
          onClose={() => setIsMonthYearPickerOpen(false)}
          currentYear={budgetYear}
          currentMonth={budgetMonth}
          onApply={handleMonthYearApply}
          days={days}
        />
      )}
    </div>
  );
};

export default React.memo(Header);

