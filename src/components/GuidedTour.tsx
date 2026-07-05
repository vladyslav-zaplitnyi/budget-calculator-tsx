import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetAppTab } from './AppTabs';
import type { BudgetViewMode } from './BudgetViewToggle';
import CurrencyFlag from './CurrencyFlag';

/** Fired by the tour so SettingsCard transiently opens every collapsible section. */
export const TOUR_EXPAND_SECTIONS_EVENT = 'budget-tour:expand-sections';
/** Fired (e.g. from the footer) to (re)launch the walkthrough on demand. */
export const TOUR_START_EVENT = 'budget-tour:start';

const TOUR_COMPLETED_KEY = 'budget_tracker_tour_completed';

interface TourStep {
  /** i18n key under `tour.steps.<key>`. */
  key: string;
  /** value of the `data-tour` attribute to spotlight (omitted for the intro). */
  target?: string;
  tab?: BudgetAppTab;
  view?: BudgetViewMode;
  /** Ask SettingsCard to open its collapsible sections before locating the anchor. */
  expandSettings?: boolean;
  /** Centered welcome screen with the "start" button. */
  intro?: boolean;
}

// Order defines the full walkthrough. New users are guided through every tab.
const STEPS: TourStep[] = [
  { key: 'intro', intro: true },
  { key: 'tabs', target: 'tabs', tab: 'budget', view: 'days' },
  { key: 'viewToggle', target: 'view-toggle', tab: 'budget', view: 'days' },
  { key: 'currency', target: 'settings-currency', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'balances', target: 'settings-balances', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'region', target: 'settings-region', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'autoFetch', target: 'settings-autofetch', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'updateRates', target: 'settings-update-rates', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'localInteraction', target: 'settings-local', tab: 'budget', view: 'days', expandSettings: true },
  { key: 'budgetStatus', target: 'budget-status', tab: 'budget', view: 'days' },
  { key: 'daysTable', target: 'days-table', tab: 'budget', view: 'days' },
  { key: 'months', target: 'months-overview', tab: 'budget', view: 'months' },
  { key: 'overview', target: 'overview-dashboard', tab: 'overview' },
  { key: 'statistics', target: 'statistics', tab: 'insights' },
  { key: 'analytics', target: 'analytics', tab: 'insights' }
];

const TOOLTIP_MAX_WIDTH = 380;
const SPOTLIGHT_PADDING = 10;

interface GuidedTourProps {
  setActiveTab: (tab: BudgetAppTab) => void;
  setBudgetViewMode: (mode: BudgetViewMode) => void;
  setLanguage: (lang: string) => void;
}

/**
 * Anchored, step-by-step product tour for first-time users. It drives the app
 * (switches tabs / views, opens settings sections), spotlights the relevant UI
 * and explains each area. It auto-starts on every visit until the user finishes
 * or skips it (persisted in localStorage), and can be re-launched via
 * `TOUR_START_EVENT`.
 */
const GuidedTour: React.FC<GuidedTourProps> = ({ setActiveTab, setBudgetViewMode, setLanguage }) => {
  const { t, i18n } = useTranslation();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the app-control callbacks in refs so the "apply step" effect does not
  // depend on their identity (avoids re-running / render loops).
  const setActiveTabRef = useRef(setActiveTab);
  const setViewRef = useRef(setBudgetViewMode);
  useEffect(() => {
    setActiveTabRef.current = setActiveTab;
    setViewRef.current = setBudgetViewMode;
  });

  // Auto-start for users who have not completed/skipped the tour yet.
  useEffect(() => {
    let alreadyDone = false;
    try {
      alreadyDone = window.localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    } catch {
      alreadyDone = false;
    }
    if (alreadyDone) return;
    const id = window.setTimeout(() => {
      setStepIndex(0);
      setReady(false);
      setActive(true);
    }, 500);
    return () => window.clearTimeout(id);
  }, []);

  // Manual (re)launch, e.g. from the footer link.
  useEffect(() => {
    const onStart = () => {
      setStepIndex(0);
      setReady(false);
      setRect(null);
      setActive(true);
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  // Apply the current step: navigate the app, open sections, then locate anchor.
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];

    if (step.tab) setActiveTabRef.current(step.tab);
    if (step.view) setViewRef.current(step.view);
    if (step.expandSettings) {
      window.dispatchEvent(new CustomEvent(TOUR_EXPAND_SECTIONS_EVENT));
    }

    let cancelled = false;
    setReady(false);

    if (!step.target) {
      setRect(null);
      const id = window.setTimeout(() => {
        if (!cancelled) setReady(true);
      }, 60);
      return () => {
        cancelled = true;
        window.clearTimeout(id);
      };
    }

    const timers: number[] = [];
    let attempts = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      setRect(el ? el.getBoundingClientRect() : null);
      setReady(true);
    };

    const seek = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        timers.push(window.setTimeout(measure, 430));
      } else if (attempts < 25) {
        attempts += 1;
        timers.push(window.setTimeout(seek, 120));
      } else {
        setRect(null);
        setReady(true);
      }
    };

    timers.push(window.setTimeout(seek, 120));
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [active, stepIndex]);

  // Keep the spotlight glued to the anchor while scrolling / resizing.
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (!step.target) return;
    const reposition = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [active, stepIndex]);

  const endTour = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setActive(false);
    setReady(false);
    setStepIndex(0);
    setRect(null);
    setActiveTabRef.current('budget');
    setViewRef.current('days');
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      if (prev >= STEPS.length - 1) {
        endTour();
        return prev;
      }
      return prev + 1;
    });
  }, [endTour]);

  const goBack = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      else if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, endTour, goNext, goBack]);

  if (!active) return null;

  const step = STEPS[stepIndex];
  const isIntro = !!step.intro;
  const isLast = stepIndex === STEPS.length - 1;
  const totalSteps = STEPS.length - 1; // excluding the intro screen

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, vw - 24);

  const hasSpotlight = ready && !!rect && !isIntro;

  const spot = hasSpotlight && rect
    ? {
        top: Math.max(rect.top - SPOTLIGHT_PADDING, 6),
        left: Math.max(rect.left - SPOTLIGHT_PADDING, 6),
        width: Math.min(rect.width + SPOTLIGHT_PADDING * 2, vw - 12),
        height: rect.height + SPOTLIGHT_PADDING * 2
      }
    : null;

  let tooltipPosition: React.CSSProperties = {};
  if (!isIntro && rect) {
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const clampedLeft = Math.min(Math.max(rect.left, 12), Math.max(12, vw - tooltipWidth - 12));
    if (spaceBelow >= 230) {
      tooltipPosition = { top: rect.top + rect.height + 14, left: clampedLeft };
    } else if (spaceAbove >= 230) {
      tooltipPosition = { bottom: vh - rect.top + 14, left: clampedLeft };
    } else {
      const centerY = rect.top + rect.height / 2;
      const centeredLeft = Math.max(12, (vw - tooltipWidth) / 2);
      tooltipPosition = centerY < vh / 2
        ? { bottom: 16, left: centeredLeft }
        : { top: 16, left: centeredLeft };
    }
  }

  const card = (
    <div
      className="tour-card"
      style={{ width: tooltipWidth, maxHeight: '82vh' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.intro.title')}
    >
      <div className="tour-card__accent" />
      <div className="tour-card__body">
        <div className="tour-card__header-row">
          {!isIntro ? (
            <div className="tour-card__progress">
              {t('tour.controls.step', { current: stepIndex, total: totalSteps })}
            </div>
          ) : (
            <span className="tour-card__progress tour-card__progress--placeholder" aria-hidden="true" />
          )}
          <div className="tour-lang" role="group" aria-label={t('header.language')}>
            <span className="tour-lang__label">{t('header.languageShort')}</span>
            <div className="tour-lang__group">
              <button
                type="button"
                onClick={() => setLanguage('uk')}
                className={`tour-lang__btn ${i18n.language === 'uk' ? 'tour-lang__btn--active' : ''}`}
                aria-pressed={i18n.language === 'uk'}
              >
                <CurrencyFlag currencyCode="uk" size={14} />
                <span>Укр</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`tour-lang__btn ${i18n.language === 'en' ? 'tour-lang__btn--active' : ''}`}
                aria-pressed={i18n.language === 'en'}
              >
                <CurrencyFlag currencyCode="USD" size={14} />
                <span>Eng</span>
              </button>
            </div>
          </div>
        </div>
        <h3 className="tour-card__title">
          {isIntro ? t('tour.intro.title') : t(`tour.steps.${step.key}.title`)}
        </h3>
        <p className="tour-card__text">
          {isIntro ? t('tour.intro.text') : t(`tour.steps.${step.key}.text`)}
        </p>

        {!isIntro && totalSteps > 0 && (
          <div className="tour-card__dots" aria-hidden="true">
            {STEPS.slice(1).map((s, i) => (
              <span
                key={s.key}
                className={`tour-dot ${i + 1 === stepIndex ? 'tour-dot--active' : ''} ${
                  i + 1 < stepIndex ? 'tour-dot--done' : ''
                }`}
              />
            ))}
          </div>
        )}

        <div className="tour-card__actions">
          <button type="button" className="tour-btn tour-btn--ghost" onClick={endTour}>
            {t('tour.controls.skip')}
          </button>
          <div className="tour-card__actions-right">
            {!isIntro && stepIndex >= 2 && (
              <button type="button" className="tour-btn tour-btn--secondary" onClick={goBack}>
                {t('tour.controls.back')}
              </button>
            )}
            <button type="button" className="tour-btn tour-btn--primary" onClick={goNext}>
              {isIntro
                ? t('tour.intro.start')
                : isLast
                  ? t('tour.controls.finish')
                  : t('tour.controls.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div className="tour-overlay" role="presentation">
      {/* Full-screen click blocker so the app behind cannot be interacted with. */}
      <div className="tour-overlay__blocker" onClick={(e) => e.stopPropagation()} />

      {spot ? (
        <div
          className="tour-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height
          }}
        />
      ) : (
        <div className="tour-overlay__dim" />
      )}

      {ready &&
        (isIntro || !rect ? (
          <div className="tour-center">{card}</div>
        ) : (
          <div className="tour-anchored" style={tooltipPosition}>
            {card}
          </div>
        ))}
    </div>,
    document.body
  );
};

export default GuidedTour;
