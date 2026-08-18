import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Day, ExchangeRates, MonthSlice } from '../types';
import {
  calculateBudgetInsights,
  calculateTwelveMonthBudgetInsights,
  OverviewTransaction
} from '../utils/budgetInsights';
import { formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import CurrencyFlag from './CurrencyFlag';
import InfoTip from './InfoTip';
import type { BudgetViewMode } from './BudgetViewToggle';

interface OverviewDashboardProps {
  days: Day[];
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  startBalances: Record<string, number | null>;
  budgetYear: number;
  budgetMonth: number;
  budgetViewMode?: BudgetViewMode;
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey?: string;
}

interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
  tone: 'blue' | 'green' | 'orange' | 'purple' | 'red';
  tip?: string;
}

const toneClasses: Record<MetricCardProps['tone'], string> = {
  blue: 'from-blue-50 to-indigo-100/80 border-blue-300 text-blue-700',
  green: 'from-emerald-50 to-green-100/80 border-emerald-300 text-emerald-700',
  orange: 'from-orange-50 to-amber-100/80 border-orange-300 text-orange-700',
  purple: 'from-violet-50 to-purple-100/80 border-violet-300 text-violet-700',
  red: 'from-rose-50 to-red-100/80 border-rose-300 text-rose-700'
};

const MetricCard: React.FC<MetricCardProps> = ({ label, value, helper, tone, tip }) => (
  <div className={`bg-gradient-to-br ${toneClasses[tone]} rounded-xl border-l-4 p-4 shadow-md`}>
    <p className="text-[11px] sm:text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
      {label}
      {tip ? <InfoTip text={tip} /> : null}
    </p>
    <p className="text-xl sm:text-2xl font-extrabold tabular-nums break-words">{value}</p>
    <p className="text-[11px] sm:text-xs text-slate-500 mt-1">{helper}</p>
  </div>
);

const isOverviewTransaction = (
  transaction: OverviewTransaction | { day: number }
): transaction is OverviewTransaction => 'month' in transaction && 'year' in transaction;

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  days,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  startBalances,
  budgetYear,
  budgetMonth,
  budgetViewMode = 'days',
  monthsByKey,
  activeMonthKey
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const symbol = getCurrencySymbol(displayCurrency);
  const isTwelveMonthView = budgetViewMode === 'months';

  const insights = useMemo(() => {
    if (isTwelveMonthView) {
      return calculateTwelveMonthBudgetInsights({
        monthsByKey,
        selectedCurrencies,
        displayCurrency,
        exchangeRates,
        startBalances,
        activeMonthKey,
        activeDays: days,
        activeStartBalances: startBalances
      });
    }

    return calculateBudgetInsights({
      days,
      selectedCurrencies,
      displayCurrency,
      exchangeRates,
      startBalances,
      budgetYear,
      budgetMonth
    });
  }, [
    isTwelveMonthView,
    monthsByKey,
    days,
    selectedCurrencies,
    displayCurrency,
    exchangeRates,
    startBalances,
    activeMonthKey,
    budgetYear,
    budgetMonth
  ]);

  const netTone = insights.netCashFlow >= 0 ? 'green' : 'red';
  const forecastTone =
    (isTwelveMonthView ? insights.remainingBalance : insights.projectedEndBalance) >= 0
      ? 'purple'
      : 'red';
  const dailyBudgetTone = insights.remainingDailyBudget >= 0 ? 'blue' : 'red';
  const topExpense = insights.topExpenses[0];

  const topExpenseDateLabel = topExpense && isOverviewTransaction(topExpense) && isTwelveMonthView
    ? t('overviewDashboard.dayWithMonth', {
        day: topExpense.day,
        month: capitalizeFirstLetter(getMonthYearLabel(locale, topExpense.year, topExpense.month))
      })
    : topExpense
      ? t('overviewDashboard.day', { day: topExpense.day })
      : '';

  const monthLabel = capitalizeFirstLetter(getMonthYearLabel(locale, budgetYear, budgetMonth));
  const progressCard = (() => {
    if (isTwelveMonthView) {
      return {
        label: t('overviewDashboard.elapsedDaysLabel'),
        value: t('overviewDashboard.elapsedDaysValue', {
          elapsed: insights.elapsedDays,
          total: insights.daysInMonth
        }),
        helper: t('overviewDashboard.filledMonthsHelper', {
          months: insights.filledMonthCount
        })
      };
    }
    if (insights.elapsedDays <= 0) {
      return {
        label: t('overviewDashboard.daysOfMonth'),
        value: t('overviewDashboard.monthNotStarted'),
        helper: t('overviewDashboard.elapsedDaysNotStarted', {
          total: insights.daysInMonth,
          month: monthLabel
        })
      };
    }
    if (insights.elapsedDays >= insights.daysInMonth) {
      return {
        label: t('overviewDashboard.daysOfMonth'),
        value: t('overviewDashboard.monthComplete'),
        helper: t('overviewDashboard.elapsedDaysComplete', {
          total: insights.daysInMonth,
          month: monthLabel
        })
      };
    }
    return {
      label: t('overviewDashboard.daysOfMonth'),
      value: t('overviewDashboard.elapsedDaysValue', {
        elapsed: insights.elapsedDays,
        total: insights.daysInMonth
      }),
      helper: t('overviewDashboard.elapsedDaysProgress', {
        percent: formatNumber(insights.monthProgress, 0),
        month: monthLabel
      })
    };
  })();

  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-100 mb-4 sm:mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 font-display">
              {t(isTwelveMonthView ? 'overviewDashboard.titleTwelveMonths' : 'overviewDashboard.title')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t(isTwelveMonthView ? 'overviewDashboard.subtitleTwelveMonths' : 'overviewDashboard.subtitle')}
            </p>
          </div>
          <InfoTip text={t('infoTips.overview')} className="mt-1" />
        </div>
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-full text-sm font-bold border border-indigo-100 w-fit">
          <CurrencyFlag currencyCode={displayCurrency} size={16} />
          {t('overviewDashboard.displayingIn', { currency: displayCurrency })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label={progressCard.label}
          value={progressCard.value}
          helper={progressCard.helper}
          tone="blue"
          tip={t(isTwelveMonthView ? 'infoTips.overviewDaysElapsedTwelve' : 'infoTips.overviewDaysElapsed')}
        />
        <MetricCard
          label={t('overviewDashboard.netCashFlow')}
          value={`${symbol}${formatNumber(insights.netCashFlow, 2)}`}
          helper={t('overviewDashboard.incomeMinusExpenses')}
          tone={netTone}
          tip={t('infoTips.overviewNetCashFlow')}
        />
        <MetricCard
          label={t('overviewDashboard.remainingDailyBudget')}
          value={`${symbol}${formatNumber(insights.remainingDailyBudget, 2)}`}
          helper={t('overviewDashboard.perRemainingDay', {
            days: insights.remainingDays
          })}
          tone={dailyBudgetTone}
          tip={t('infoTips.overviewRemainingDaily')}
        />
        <MetricCard
          label={t(isTwelveMonthView ? 'overviewDashboard.remainingAfterTransactions' : 'overviewDashboard.projectedEndBalance')}
          value={`${symbol}${formatNumber(
            isTwelveMonthView ? insights.remainingBalance : insights.projectedEndBalance,
            2
          )}`}
          helper={t(
            isTwelveMonthView
              ? 'overviewDashboard.forecastHelperTwelveMonths'
              : 'overviewDashboard.forecastHelper'
          )}
          tone={forecastTone}
          tip={t(isTwelveMonthView ? 'infoTips.overviewRemainingBalance' : 'infoTips.overviewProjectedBalance')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
            {t('overviewDashboard.topExpense')}
            <InfoTip text={t('infoTips.overviewTopExpense')} />
          </p>
          {topExpense ? (
            <>
              <p className="text-base font-bold text-gray-800 truncate">
                {topExpense.description}
              </p>
              <p className="text-sm text-rose-600 font-semibold tabular-nums mt-1">
                {symbol}{formatNumber(topExpense.convertedAmount, 2)}
                <span className="text-gray-400 font-medium ml-2">
                  {topExpenseDateLabel}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">{t('overviewDashboard.noExpensesYet')}</p>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
            {t('overviewDashboard.noSpendDays')}
            <InfoTip text={t('infoTips.noSpendDays')} />
          </p>
          <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">
            {insights.noSpendDays}
          </p>
          <p className="text-sm text-gray-500">
            {t('overviewDashboard.noSpendDaysHelper', { days: insights.elapsedDays })}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
            {t('overviewDashboard.savingsRate')}
            <InfoTip text={t('infoTips.savingsRate')} />
          </p>
          <p className={`text-2xl font-extrabold tabular-nums ${
            insights.savingsRate >= 0 ? 'text-violet-600' : 'text-rose-600'
          }`}>
            {formatNumber(insights.savingsRate, 1)}%
          </p>
          <p className="text-sm text-gray-500">
            {t('overviewDashboard.savingsRateHelper')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OverviewDashboard);
