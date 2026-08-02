import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrencyInfo, getCurrencySymbol, AVAILABLE_CURRENCIES, getCurrencyName } from '../utils/currencies';
import { convertCurrency, formatNumber, calculateDayAmountsFromTransactions } from '../utils/calculations';
import { getDaysInMonth } from '../utils/dateHelpers';
import { Day, ExchangeRates, MonthSlice } from '../types';
import CurrencyFlag from './CurrencyFlag';
import InfoTip from './InfoTip';
import {
  buildTwelveMonthBalanceRows,
  OverviewMonthBalanceRow
} from '../utils/rollingMonthsBudget';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';

const BALANCE_CARD_COLORS = [
  'border-blue-200 hover:border-blue-300',
  'border-emerald-200 hover:border-emerald-300',
  'border-amber-200 hover:border-amber-300'
];

const getBalanceFontClass = (value: number): string => {
  const len = formatNumber(Math.abs(value), 2).length;
  if (len > 16) return 'text-base sm:text-lg lg:text-xl';
  if (len > 12) return 'text-lg sm:text-xl lg:text-2xl';
  return 'text-2xl sm:text-3xl lg:text-4xl';
};

interface BudgetStatusProps {
  finalBalances: Record<string, number>;
  startBalances: Record<string, number | null>;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  totalInUAH: number;
  totalInBaseCurrency: number;
  baseCurrency: string;
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => void;
  setDisplayCurrencyIndex: (index: number) => void;
  totalInDisplayCurrency: number;
  days: Day[];
  budgetYear: number;
  budgetMonth: number;
  /** When `months`, month slider shows balances from the 12-month overview window. */
  budgetViewMode?: 'days' | 'months';
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey?: string;
  /** When true, display currency cannot be changed (it is persisted with the budget). */
  readOnly?: boolean;
}

const CRITICAL_DAYS_STORAGE_KEY = 'budget_critical_days_expanded';
const CRITICAL_MONTHS_STORAGE_KEY = 'budget_critical_months_expanded';

const BudgetStatus: React.FC<BudgetStatusProps> = ({
  finalBalances = {},
  startBalances = {},
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  exchangeRates = {},
  totalInUAH,
  totalInBaseCurrency,
  baseCurrency = 'UAH',
  displayCurrency = 'UAH',
  setDisplayCurrency,
  setDisplayCurrencyIndex,
  totalInDisplayCurrency,
  days,
  budgetYear,
  budgetMonth,
  budgetViewMode = 'days',
  monthsByKey,
  activeMonthKey,
  readOnly = false
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const daysInMonth = getDaysInMonth(budgetYear, budgetMonth);

  const [selectedDay, setSelectedDay] = useState<number>(daysInMonth);
  /** 1..12 — позиція в 12-місячному вікні (1 = поточний календарний місяць). */
  const [selectedPlannerMonthSlot, setSelectedPlannerMonthSlot] = useState<number>(1);

  const [isCriticalExpanded, setIsCriticalExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(CRITICAL_DAYS_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const toggleCritical = useCallback(() => {
    setIsCriticalExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(CRITICAL_DAYS_STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [isCriticalMonthsExpanded, setIsCriticalMonthsExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(CRITICAL_MONTHS_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const toggleCriticalMonths = useCallback(() => {
    setIsCriticalMonthsExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem(CRITICAL_MONTHS_STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const getConvertedValue = useCallback((currencyCode: string, finalBalance: number) => {
    if (currencyCode === displayCurrency) return null;
    const displayInfo = getCurrencyInfo(displayCurrency);
    const dSym = displayInfo ? displayInfo.symbol : displayCurrency;
    const convertedValue = convertCurrency(finalBalance, currencyCode, displayCurrency, exchangeRates);
    return `≈ ${formatNumber(convertedValue, 2)} ${dSym}`;
  }, [displayCurrency, exchangeRates]);

  // Compute cumulative balance in display currency for each day (days mode),
  // або рядки 12-місячного плану + критичні місяці (months mode).
  const { dailyBalances, criticalDays, criticalMonths, monthlyBalanceRows } = useMemo(() => {
    const emptyMonthRows: OverviewMonthBalanceRow[] = [];
    if (budgetViewMode === 'months') {
      const rows = buildTwelveMonthBalanceRows({
        monthsByKey,
        selectedCurrencies,
        displayCurrency,
        exchangeRates,
        activeMonthKey,
        activeDays: days,
        activeStartBalances: startBalances
      });
      if (rows.length === 0) {
        return {
          dailyBalances: [] as number[],
          criticalDays: [] as { day: number; balance: number }[],
          criticalMonths: [] as { key: string; year: number; month: number; balance: number }[],
          monthlyBalanceRows: rows
        };
      }
      const minBalance = Math.min(...rows.map((r) => r.balance));
      const criticalMonthsList = rows
        .filter((r) => r.balance === minBalance)
        .slice(0, 5)
        .map((r) => ({
          key: r.key,
          year: r.year,
          month: r.month,
          balance: r.balance
        }));
      return {
        dailyBalances: [],
        criticalDays: [],
        criticalMonths: criticalMonthsList,
        monthlyBalanceRows: rows
      };
    }

    const visibleDays = days.slice(0, daysInMonth);
    const balances: number[] = [];

    let startTotal = 0;
    for (const code of selectedCurrencies) {
      const bal = parseFloat(String(startBalances[code])) || 0;
      startTotal += convertCurrency(bal, code, displayCurrency, exchangeRates);
    }

    let running = startTotal;
    for (let i = 0; i < daysInMonth; i++) {
      const dayData = visibleDays[i];
      if (dayData) {
        const amounts = calculateDayAmountsFromTransactions(dayData, selectedCurrencies);
        for (const code of selectedCurrencies) {
          const inc = convertCurrency(amounts[`income${code}`] || 0, code, displayCurrency, exchangeRates);
          const exp = convertCurrency(amounts[`expense${code}`] || 0, code, displayCurrency, exchangeRates);
          running += inc - exp;
        }
      }
      balances.push(running);
    }

    if (balances.length === 0) {
      return { dailyBalances: [], criticalDays: [], criticalMonths: [], monthlyBalanceRows: emptyMonthRows };
    }

    const minBalance = Math.min(...balances);
    const critical = balances
      .map((bal, i) => ({ day: i + 1, balance: bal }))
      .filter(d => d.balance === minBalance)
      .slice(0, 5);

    return { dailyBalances: balances, criticalDays: critical, criticalMonths: [], monthlyBalanceRows: emptyMonthRows };
  }, [budgetViewMode, monthsByKey, activeMonthKey, displayCurrency, exchangeRates, days, daysInMonth, selectedCurrencies, startBalances]);

  useEffect(() => {
    if (budgetViewMode === 'months') {
      setSelectedPlannerMonthSlot(1);
    }
  }, [budgetViewMode]);

  // Clamp day selector when switching to a shorter month (e.g. 31 → 30).
  useEffect(() => {
    setSelectedDay((prev) => Math.min(Math.max(prev, 1), daysInMonth));
  }, [daysInMonth]);

  // Balance as of the selected day
  const selectedDayBalance = dailyBalances.length > 0 && selectedDay >= 1 && selectedDay <= dailyBalances.length
    ? dailyBalances[selectedDay - 1]
    : null;

  const isEndOfMonth = selectedDay === daysInMonth;
  const displaySymbol = getCurrencySymbol(displayCurrency);

  const plannerMonthCount = monthlyBalanceRows.length;
  const selectedPlannerRow =
    plannerMonthCount > 0 && selectedPlannerMonthSlot >= 1 && selectedPlannerMonthSlot <= plannerMonthCount
      ? monthlyBalanceRows[selectedPlannerMonthSlot - 1]
      : undefined;
  const selectedPlannerMonthLabel = selectedPlannerRow
    ? capitalizeFirstLetter(
        getMonthYearLabel(i18nInstance.language || 'en', selectedPlannerRow.year, selectedPlannerRow.month)
      )
    : '';
  const selectedPlannerBalance = selectedPlannerRow?.balance ?? null;
  const isEndOfPlannerWindow = plannerMonthCount > 0 && selectedPlannerMonthSlot === plannerMonthCount;

  const selectedBudgetMonthLabel = capitalizeFirstLetter(
    getMonthYearLabel(i18nInstance.language || 'en', budgetYear, budgetMonth)
  );

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-indigo-100 transition-all hover:shadow-2xl">
      <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2 font-display tracking-tight">
        <span className="mr-2 text-2xl">📊</span>
        <span className="min-w-0">{t('budgetStatus.title', { month: selectedBudgetMonthLabel })}</span>
        <InfoTip text={t('infoTips.budgetStatus')} />
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {selectedCurrencies.map((currencyCode, index) => {
          const currency = getCurrencyInfo(currencyCode);
          if (!currency) return null;
          
          const finalBalance = finalBalances[`finalBalance${currencyCode}`] || 0;
          const startBalance = startBalances[currencyCode] ?? null;
          const startBalanceValue = startBalance !== null && startBalance !== undefined 
            ? parseFloat(String(startBalance)) || 0 
            : 0;
          const isPositive = finalBalance >= startBalanceValue;
          
          return (
            <div key={currencyCode} className={`bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border-2 ${BALANCE_CARD_COLORS[index % BALANCE_CARD_COLORS.length]} transition-all hover:scale-105 hover:shadow-xl`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm font-semibold text-gray-600 font-display tracking-tight">
                  {t('budgetStatus.balance')} {currencyCode}
                </p>
                <CurrencyFlag currencyCode={currencyCode} size={18} />
              </div>
              <p className={`${getBalanceFontClass(finalBalance)} font-extrabold mb-1 font-display break-words overflow-hidden tabular-nums budget-number ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {currency.symbol}{formatNumber(finalBalance, 2)}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 font-sans tabular-nums truncate">
                {getConvertedValue(currencyCode, finalBalance) || '\u00A0'}
              </p>
            </div>
          );
        })}

        {/* Total in Display Currency */}
        <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-4 rounded-xl shadow-lg border-2 border-indigo-300 hover:border-indigo-400 hover:shadow-2xl transition-all !text-white relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold font-display tracking-tight !text-white flex items-center gap-1.5">
              {t('budgetStatus.totalValue')}
              <InfoTip text={t('infoTips.totalValue')} tone="onDark" />
            </p>
            <span className="text-xl">💎</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <p className={`${getBalanceFontClass(totalInDisplayCurrency ?? totalInBaseCurrency ?? totalInUAH)} font-extrabold font-display break-words overflow-hidden tabular-nums budget-number samsung-white-text`}>
              {getCurrencySymbol(displayCurrency)}
              {(() => {
                if (totalInDisplayCurrency !== undefined) {
                  return formatNumber(totalInDisplayCurrency, 2);
                }
                if (totalInBaseCurrency !== undefined) {
                  return formatNumber(totalInBaseCurrency, 2);
                }
                return formatNumber(totalInUAH, 2);
              })()}
            </p>
            {/* Currency selector dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (readOnly) return;
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                disabled={readOnly}
                className={`flex items-center space-x-1 bg-white/20 rounded-lg px-2 py-1.5 transition-all ${
                  readOnly ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/30 hover:scale-105'
                }`}
                title={t('budgetStatus.selectDisplayCurrency')}
              >
                <CurrencyFlag currencyCode={displayCurrency} size={16} />
                <span className="text-xs font-semibold font-display">{displayCurrency}</span>
                <span className="text-xs">▼</span>
              </button>
              
              {isDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[100]" 
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border-2 border-indigo-200 z-[101] min-w-[220px] max-h-[320px] overflow-y-auto">
                    <div className="p-2 space-y-1">
                      {selectedCurrencies.map((currencyCode) => {
                        const currency = AVAILABLE_CURRENCIES[currencyCode];
                        if (!currency) return null;
                        
                        const isSelected = currencyCode === displayCurrency;
                        
                        return (
                          <button
                            key={currencyCode}
                            type="button"
                            onClick={() => {
                              if (readOnly) return;
                              if (setDisplayCurrency) {
                                setDisplayCurrency(currencyCode);
                                const index = selectedCurrencies.indexOf(currencyCode);
                                if (index !== -1 && setDisplayCurrencyIndex) {
                                  setDisplayCurrencyIndex(index);
                                }
                              }
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all text-left hover:bg-indigo-50 text-gray-700 ${
                              isSelected ? 'bg-indigo-50 font-semibold' : ''
                            }`}
                          >
                            <div className="flex-shrink-0">
                              <CurrencyFlag currencyCode={currencyCode} size={20} />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold font-display">{currencyCode}</div>
                              <div className="text-xs text-gray-500">
                                {getCurrencyName(currencyCode, i18nInstance.language === 'uk' ? 'uk' : 'en')}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-indigo-600 text-lg">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="text-[10px] sm:text-xs opacity-90 font-mono break-words overflow-hidden tabular-nums samsung-white-text leading-relaxed">
            {displayCurrency} ({selectedCurrencies.map((code, idx) => {
              const balance = finalBalances[`finalBalance${code}`] || 0;
              const symbol = getCurrencySymbol(code);
              return `${idx > 0 ? ' + ' : ''}${symbol}${formatNumber(balance, 0)}`;
            }).join('')})
          </p>
        </div>
      </div>

      {/* Day selector & projected balance (days mode only) */}
      {budgetViewMode === 'days' && dailyBalances.length > 0 && (
        <div className="mt-4 bg-white/80 backdrop-blur rounded-xl p-4 border border-indigo-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0">📅</span>
              <div className="flex-1 min-w-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                  {t('budgetStatus.selectDay')}
                  <InfoTip text={t('infoTips.selectDay')} />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={daysInMonth}
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(Number(e.target.value))}
                    className="flex-1 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-sm font-bold text-indigo-700 tabular-nums w-8 text-center flex-shrink-0">
                    {selectedDay}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <p className="text-[10px] text-gray-500">
                  {isEndOfMonth ? t('budgetStatus.endOfMonth') : t('budgetStatus.balanceOnDay', { day: selectedDay })}
                </p>
                <p className={`text-lg sm:text-xl font-bold tabular-nums ${
                  selectedDayBalance !== null && selectedDayBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {displaySymbol}{formatNumber(selectedDayBalance ?? 0, 2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Month selector & projected balance (12-month plan mode) */}
      {budgetViewMode === 'months' && plannerMonthCount > 0 && (
        <div className="mt-4 bg-white/80 backdrop-blur rounded-xl p-4 border border-indigo-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg flex-shrink-0">📅</span>
              <div className="flex-1 min-w-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                  {t('budgetStatus.selectMonth')}
                  <InfoTip text={t('infoTips.selectMonth')} />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={plannerMonthCount}
                    value={selectedPlannerMonthSlot}
                    onChange={(e) => setSelectedPlannerMonthSlot(Number(e.target.value))}
                    className="flex-1 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-sm font-bold text-indigo-700 tabular-nums w-8 text-center flex-shrink-0">
                    {selectedPlannerMonthSlot}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate" title={selectedPlannerMonthLabel}>
                  {selectedPlannerMonthLabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <p className="text-[10px] text-gray-500">
                  {isEndOfPlannerWindow
                    ? t('budgetStatus.endOfPlannerWindow')
                    : t('budgetStatus.balanceOnMonth', { month: selectedPlannerMonthLabel })}
                </p>
                <p
                  className={`text-lg sm:text-xl font-bold tabular-nums ${
                    selectedPlannerBalance === null
                      ? 'text-gray-400'
                      : selectedPlannerBalance >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}
                >
                  {selectedPlannerBalance === null ? '—' : `${displaySymbol}${formatNumber(selectedPlannerBalance, 2)}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Critical days — days mode */}
      {budgetViewMode === 'days' && criticalDays.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCritical}
              className="flex-1 flex items-center justify-between bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl px-4 py-2.5 border border-rose-200 hover:border-rose-300 transition-all text-left"
            >
              <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-rose-700">
                <span>⚠️</span>
                {t('budgetStatus.criticalDays')}
              </span>
              <span className="text-xs text-gray-500">
                {isCriticalExpanded ? '▲' : '▼'}
              </span>
            </button>
            <InfoTip text={t('infoTips.criticalDays')} />
          </div>

          {isCriticalExpanded && (
            <div className="mt-2 bg-white/80 rounded-xl border border-rose-100 p-3 space-y-2">
              {criticalDays.map((cd) => (
                <div
                  key={cd.day}
                  className="flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2 border border-rose-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-rose-500 font-bold text-sm">
                      {t('budgetStatus.dayLabel')} {cd.day}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${cd.balance >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {displaySymbol}{formatNumber(cd.balance, 2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Critical months — 12-month plan mode */}
      {budgetViewMode === 'months' && criticalMonths.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCriticalMonths}
              className="flex-1 flex items-center justify-between bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl px-4 py-2.5 border border-rose-200 hover:border-rose-300 transition-all text-left"
            >
              <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-rose-700">
                <span>⚠️</span>
                {t('budgetStatus.criticalMonths')}
              </span>
              <span className="text-xs text-gray-500">
                {isCriticalMonthsExpanded ? '▲' : '▼'}
              </span>
            </button>
            <InfoTip text={t('infoTips.criticalMonths')} />
          </div>

          {isCriticalMonthsExpanded && (
            <div className="mt-2 bg-white/80 rounded-xl border border-rose-100 p-3 space-y-2">
              {criticalMonths.map((cm) => {
                const locale = i18nInstance.language || 'en';
                const label = capitalizeFirstLetter(getMonthYearLabel(locale, cm.year, cm.month));
                return (
                  <div
                    key={cm.key}
                    className="flex items-center justify-between bg-rose-50 rounded-lg px-3 py-2 border border-rose-100"
                  >
                    <span className="text-rose-500 font-bold text-sm">
                      {label}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${cm.balance >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {displaySymbol}{formatNumber(cm.balance, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(BudgetStatus);
