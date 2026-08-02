import React from 'react';
import { useTranslation } from 'react-i18next';
import InfoTip from './InfoTip';

export type BudgetViewMode = 'days' | 'months';

interface BudgetViewToggleProps {
  mode: BudgetViewMode;
  onChange: (mode: BudgetViewMode) => void;
  className?: string;
}

const modes: BudgetViewMode[] = ['days', 'months'];

const BudgetViewToggle: React.FC<BudgetViewToggleProps> = ({
  mode,
  onChange,
  className = 'mb-4 sm:mb-6'
}) => {
  const { t } = useTranslation();

  return (
    <div className={`rounded-2xl bg-white shadow-md p-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500">
          {t('budgetView.ariaLabel')}
        </span>
        <InfoTip text={t('infoTips.budgetView')} />
      </div>
      <div
        className="grid grid-cols-2 gap-1.5"
        role="tablist"
        aria-label={t('budgetView.ariaLabel')}
      >
        {modes.map((viewMode) => {
          const isActive = mode === viewMode;
          return (
            <button
              key={viewMode}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(viewMode)}
              className={`appearance-none px-3 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all focus:outline-none ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="block truncate">{t(`budgetView.${viewMode}`)}</span>
              <span
                className={`hidden sm:block text-[11px] font-medium mt-0.5 ${
                  isActive ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                {t(`budgetView.${viewMode}Hint`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(BudgetViewToggle);
