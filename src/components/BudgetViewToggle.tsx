import React from 'react';
import { translate } from '../i18n/config';

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
}) => (
  <div className={`rounded-2xl bg-white shadow-md border border-slate-200 p-1.5 ${className}`}>
    <div
      className="grid grid-cols-2 gap-1.5"
      role="tablist"
      aria-label={translate('budgetView.ariaLabel')}
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
            className={`appearance-none px-3 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              isActive
                ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="block truncate">{translate(`budgetView.${viewMode}`)}</span>
            <span
              className={`hidden sm:block text-[11px] font-medium mt-0.5 ${
                isActive ? 'text-blue-100' : 'text-slate-500'
              }`}
            >
              {translate(`budgetView.${viewMode}Hint`)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default React.memo(BudgetViewToggle);
