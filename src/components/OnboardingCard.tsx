import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ONBOARDING_DISMISSED_KEY = 'budget_tracker_onboarding_dismissed';

interface OnboardingCardProps {
  isSignedIn: boolean;
  onSignIn: () => Promise<void> | void;
}

/**
 * Friendly first-run guide for new users. Explains the daily view, the 12-month
 * planner and cloud sync (up to 2 budget books). Dismissable; the choice is
 * persisted in localStorage. Uses only the existing app color palette.
 */
const OnboardingCard: React.FC<OnboardingCardProps> = ({ isSignedIn, onSignIn }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
      }
    } catch {
      // ignore storage errors
    }
  };

  if (dismissed) return null;

  const steps = [
    {
      icon: '📅',
      accent: 'bg-indigo-100 text-indigo-700',
      title: t('onboarding.days.title'),
      text: t('onboarding.days.text')
    },
    {
      icon: '🗓️',
      accent: 'bg-violet-100 text-violet-700',
      title: t('onboarding.plan.title'),
      text: t('onboarding.plan.text')
    },
    {
      icon: '☁️',
      accent: 'bg-blue-100 text-blue-700',
      title: t('onboarding.sync.title'),
      text: t('onboarding.sync.text')
    }
  ];

  return (
    <div className="relative mb-4 sm:mb-6 rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 overflow-hidden">
      {/* Thin gradient accent strip instead of a heavy gradient block */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600" />

      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600 flex items-center justify-center text-xl shadow-sm">
              👋
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                {t('onboarding.title')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{t('onboarding.intro')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 w-8 h-8 flex items-center justify-center text-base transition-colors"
            aria-label={t('onboarding.dismiss')}
            title={t('onboarding.dismiss')}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-lg ${step.accent}`}
                >
                  {step.icon}
                </span>
                <h3 className="text-sm font-bold text-slate-800 leading-snug">
                  <span className="text-slate-400 mr-1">{index + 1}.</span>
                  {step.title}
                </h3>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
          {!isSignedIn && (
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.98] transition-all"
            >
              {t('onboarding.signInCta')}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all"
          >
            {t('onboarding.getStarted')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingCard;
