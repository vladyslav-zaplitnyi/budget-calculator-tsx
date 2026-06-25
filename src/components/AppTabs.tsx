import React from 'react';
import { useTranslation } from 'react-i18next';

export type BudgetAppTab = 'budget' | 'overview' | 'insights';

interface AppTabsProps {
  activeTab: BudgetAppTab;
  onChange: (tab: BudgetAppTab) => void;
}

const tabs: BudgetAppTab[] = ['budget', 'overview', 'insights'];

const AppTabs: React.FC<AppTabsProps> = ({ activeTab, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 p-1.5 mb-4 sm:mb-6 shadow-xl overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5" role="tablist" aria-label={t('tabs.ariaLabel')}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              className={`appearance-none px-3 sm:px-4 py-3 rounded-xl text-sm sm:text-base font-bold transition-all focus:outline-none ${
                isActive
                  ? 'bg-white text-indigo-700 shadow-lg'
                  : 'bg-white/15 text-white hover:bg-white/25 shadow-sm'
              }`}
            >
              <span className="block truncate">{t(`tabs.${tab}`)}</span>
              <span className={`hidden sm:block text-[11px] font-medium mt-0.5 ${
                isActive ? 'text-indigo-500' : 'text-blue-50/90'
              }`}>
                {t(`tabs.${tab}Hint`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(AppTabs);
