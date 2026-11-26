import React, { ChangeEvent, RefObject, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AVAILABLE_CURRENCIES,
  getCurrencyName,
  getCurrencyRegionLabel,
  getRegionalCurrencyOptions,
  getStoredRegionCode,
  REGION_AUTO_VALUE,
  REGION_CURRENCY_STORAGE_KEY,
  resolveRegionalCurrency
} from '../utils/currencies';
import { User } from 'firebase/auth';
import { Budgets, ExchangeRates, Day, MonthSlice, Transaction } from '../types';
import { isExchangeRatePair, getBuyRate } from '../utils/typeGuards';
import { roundToDecimals } from '../utils/rounding';
import { sanitizeNumberInput, formatNumber } from '../utils/calculations';
import { parseMonthKey } from '../utils/monthlyPlan';
import CurrencyFlag from './CurrencyFlag';
import BulkTransactionModal from './BulkTransactionModal';
import MultiMonthBulkTransactionModal from './MultiMonthBulkTransactionModal';
import BudgetForecastModal from './BudgetForecastModal';
import CsvImportModal from './CsvImportModal';
import InfoTip from './InfoTip';
import { parseTransactionsCsv, CsvParseResult } from '../utils/csvImport';
import { TOUR_EXPAND_SECTIONS_EVENT } from './GuidedTour';
import type {
  ClearDaysScope,
  CurrencyMigrationMode,
  CurrencyMigrationRequest
} from '../hooks/useBudgetSettings';
import type { MultiMonthBulkTransactionDraft } from '../utils/multiMonthBulkTransactions';
import type { ForecastCopyDraft } from '../utils/budgetForecast';

interface SettingsCardProps {
  isUk: boolean;
  user: User | null;
  budgets: Budgets | null | undefined;
  activeBudgetId: string;
  selectedCurrencies: string[];
  exchangeRates: ExchangeRates;
  handleCurrencyChange: (currencies: string[], migrations?: CurrencyMigrationRequest[]) => void;
  handleExchangeRateChange: (pairKey: string, type: string | undefined, rate: number) => void;
  handleStartBalanceChange: (currencyCode: string, value: string) => void;
  handleExportToJsonFile: () => void;
  onExportPdf?: () => void;
  handleImportFromJsonFile: () => void;
  isLoading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleJsonFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  saveMessage: string;
  loadMessage: string;
  handleClearAllDays: (scope: ClearDaysScope) => void;
  handleClearStartBalances: () => void;
  baseCurrency: string;
  handleUpdateNbuRates: () => Promise<void>;
  isUpdatingRates: boolean;
  rateUpdateMessage: string;
  // Encryption props
  handleEnableEncryptionClick?: () => void;
  handleDisableEncryptionClick?: () => void;
  handleEnableEncryption?: (password: string, confirmPassword: string) => void;
  handleDisableEncryption?: (password: string) => void;
  showEnableEncryptionModal?: boolean;
  showDisableEncryptionModal?: boolean;
  setShowEnableEncryptionModal?: (show: boolean) => void;
  setShowDisableEncryptionModal?: (show: boolean) => void;
  isEncrypted?: boolean;
  updateDay?: (index: number, field: string, value: any) => void;
  days?: Day[];
  budgetYear: number;
  budgetMonth: number;
  budgetViewMode?: 'days' | 'months';
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey?: string;
  onBulkAddTransactionsToMonths?: (draft: MultiMonthBulkTransactionDraft) => void;
  onForecastCopyToMonths?: (draft: ForecastCopyDraft) => void;
  readOnly?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  isUk,
  user,
  budgets = {},
  activeBudgetId,
  selectedCurrencies = ['UAH', 'USD', 'EUR'],
  exchangeRates = {},
  handleCurrencyChange,
  handleExchangeRateChange,
  handleStartBalanceChange,
  handleExportToJsonFile,
  onExportPdf,
  handleImportFromJsonFile,
  isLoading,
  fileInputRef,
  handleJsonFileSelected,
  saveMessage,
  loadMessage,
  handleClearAllDays,
  handleClearStartBalances,
  baseCurrency = 'UAH',
  handleUpdateNbuRates,
  isUpdatingRates,
  rateUpdateMessage,
  handleEnableEncryptionClick,
  handleDisableEncryptionClick,
  handleEnableEncryption,
  handleDisableEncryption,
  showEnableEncryptionModal = false,
  showDisableEncryptionModal = false,
  setShowEnableEncryptionModal,
  setShowDisableEncryptionModal,
  isEncrypted = false,
  updateDay,
  days = [],
  budgetYear,
  budgetMonth,
  budgetViewMode = 'days',
  monthsByKey,
  activeMonthKey = '',
  onBulkAddTransactionsToMonths,
  onForecastCopyToMonths,
  readOnly = false
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const currencyLanguage = i18nInstance.language === 'uk' ? 'uk' : 'en';
  const regionOptions = React.useMemo(() => getRegionalCurrencyOptions(), []);
  const [selectedRegionCode, setSelectedRegionCode] = useState<string>(() => getStoredRegionCode());
  const regionalCurrency = React.useMemo(
    () => resolveRegionalCurrency(selectedRegionCode),
    [selectedRegionCode]
  );
  const exchangeRateCurrencies = React.useMemo(
    () => Array.from(new Set([
      ...selectedCurrencies,
      ...(regionalCurrency ? [regionalCurrency.currencyCode] : [])
    ])),
    [selectedCurrencies, regionalCurrency]
  );

  const monthNames = t('calendar.monthsLong', { returnObjects: true }) as string[];
  const selectedMonthLabel = monthNames[budgetMonth] || '';

  const calculatedMonthBudgets = React.useMemo(() => {
    if (!activeMonthKey) return null;
    const safeBudgetsForCalc = budgets || {};
    const activeBudget = safeBudgetsForCalc[activeBudgetId || 'default'];
    const sourceMonths = monthsByKey || activeBudget?.monthsByKey;
    const sliceStarts = sourceMonths?.[activeMonthKey]?.startBalances;
    const seedStarts = activeBudget?.startBalances || {};

    const balances: Record<string, number | null> = {};
    let hasAny = false;
    selectedCurrencies.forEach((code) => {
      const value = sliceStarts
        ? (sliceStarts[code] ?? null)
        : (seedStarts[code] ?? null);
      balances[code] = value;
      if (value !== null && value !== undefined) hasAny = true;
    });

    // Always show the month line when we know the selected month (seed or carry-over).
    return hasAny || Boolean(sourceMonths?.[activeMonthKey]) || Boolean(activeBudget)
      ? balances
      : null;
  }, [
    activeMonthKey,
    budgets,
    activeBudgetId,
    monthsByKey,
    selectedCurrencies
  ]);


  /** Raw string while editing — avoids collapsing "3." / "3," to a number before the user finishes typing. */
  const [startBalanceFocusCode, setStartBalanceFocusCode] = useState<string | null>(null);
  const [startBalanceDraftByCode, setStartBalanceDraftByCode] = useState<Record<string, string>>({});

  useEffect(() => {
    setStartBalanceFocusCode(null);
  }, [activeBudgetId]);
  
  // Ensure budgets is always an object to prevent runtime errors
  const safeBudgets = budgets || {};

  // Скільки транзакцій є для кожної валюти в УСІХ місяцях бюджету, а не лише в переглянутому.
  // Раніше зміна валюти чистила лише поточний місяць, тому в інших місяцях транзакції
  // залишалися в старій валюті й переставали враховуватися в балансах.
  const currencyUsage = React.useMemo(() => {
    const activeBudget = (budgets || {})[activeBudgetId || 'default'];
    const counts: Record<string, number> = {};
    const addTransactions = (transactions?: Transaction[]) => {
      (transactions || []).forEach((tx) => {
        const code = String(tx.currency || '').toUpperCase();
        if (!code) return;
        counts[code] = (counts[code] || 0) + 1;
      });
    };
    const addDays = (sourceDays?: Day[]) => {
      (sourceDays || []).forEach((day) => addTransactions(day?.transactions));
    };

    const months = monthsByKey || activeBudget?.monthsByKey || {};
    const monthKeys = Object.keys(months);
    if (monthKeys.length > 0) {
      monthKeys.forEach((key) => {
        if (key === activeMonthKey) {
          addDays(days);
        } else {
          addDays(months[key]?.days);
        }
      });
    } else {
      addDays(days);
    }
    Object.values(activeBudget?.monthlyPlans || {}).forEach((transactions) =>
      addTransactions(transactions)
    );
    return counts;
  }, [budgets, activeBudgetId, monthsByKey, activeMonthKey, days]);

  const orphanCurrencyUsage = React.useMemo(
    () =>
      Object.entries(currencyUsage)
        .filter(([code, count]) => count > 0 && !selectedCurrencies.includes(code))
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    [currencyUsage, selectedCurrencies]
  );

  const orphanTransactionTotal = orphanCurrencyUsage.reduce((sum, item) => sum + item.count, 0);

  // Де саме лежать «сирітські» транзакції: місяць → дні → валюти з кількістю.
  // Потрібно, щоб користувач міг глянути, що там є, перш ніж конвертувати чи видаляти.
  const orphanTransactionLocations = React.useMemo(() => {
    const activeBudget = (budgets || {})[activeBudgetId || 'default'];
    interface LocationEntry {
      label: string;
      codes: string;
    }
    interface LocationGroup {
      key: string;
      label: string;
      total: number;
      entries: LocationEntry[];
    }
    const groups = new Map<string, LocationGroup>();

    const collect = (transactions?: Transaction[]) => {
      const counts: Record<string, number> = {};
      (transactions || []).forEach((tx) => {
        const code = String(tx.currency || '').toUpperCase();
        if (!code || selectedCurrencies.includes(code)) return;
        counts[code] = (counts[code] || 0) + 1;
      });
      const codes = Object.entries(counts)
        .map(([code, count]) => `${code} ×${count}`)
        .join(', ');
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      return codes ? { codes, total } : null;
    };

    const ensureGroup = (key: string, label: string) => {
      let group = groups.get(key);
      if (!group) {
        group = { key, label, total: 0, entries: [] };
        groups.set(key, group);
      }
      return group;
    };

    const monthLabelFor = (key: string) => {
      const parsed = parseMonthKey(key);
      if (!parsed) return key;
      return `${monthNames[parsed.month] || key} ${parsed.year}`;
    };

    const months = monthsByKey || activeBudget?.monthsByKey || {};
    const monthKeys = Object.keys(months);

    if (monthKeys.length > 0) {
      monthKeys.forEach((key) => {
        const sourceDays = key === activeMonthKey ? days : months[key]?.days;
        (sourceDays || []).forEach((day) => {
          const found = collect(day?.transactions);
          if (!found) return;
          const group = ensureGroup(key, monthLabelFor(key));
          group.entries.push({
            label: t('settings.currency.orphans.dayLabel', { day: day.day }),
            codes: found.codes
          });
          group.total += found.total;
        });
      });
    } else {
      const currentLabel = `${monthNames[budgetMonth] || ''} ${budgetYear}`.trim();
      days.forEach((day) => {
        const found = collect(day?.transactions);
        if (!found) return;
        const group = ensureGroup('current', currentLabel);
        group.entries.push({
          label: t('settings.currency.orphans.dayLabel', { day: day.day }),
          codes: found.codes
        });
        group.total += found.total;
      });
    }

    Object.entries(activeBudget?.monthlyPlans || {}).forEach(([key, transactions]) => {
      const found = collect(transactions);
      if (!found) return;
      const group = ensureGroup(`plan-${key}`, monthLabelFor(key));
      group.entries.push({
        label: t('settings.currency.orphans.planLabel'),
        codes: found.codes
      });
      group.total += found.total;
    });

    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [
    budgets,
    activeBudgetId,
    monthsByKey,
    activeMonthKey,
    days,
    selectedCurrencies,
    monthNames,
    budgetMonth,
    budgetYear,
    t
  ]);

  const [showOrphanLocations, setShowOrphanLocations] = useState(false);

  // У яку з відстежуваних валют конвертувати «сирітські» транзакції.
  const [orphanTargetCurrency, setOrphanTargetCurrency] = useState<string>(selectedCurrencies[0] || '');

  useEffect(() => {
    if (!selectedCurrencies.includes(orphanTargetCurrency)) {
      setOrphanTargetCurrency(selectedCurrencies[0] || '');
    }
  }, [selectedCurrencies, orphanTargetCurrency]);
  
  // Стан для модального вікна підтвердження зміни валюти
  const [showCurrencyChangeConfirm, setShowCurrencyChangeConfirm] = useState(false);
  const [pendingCurrencyChange, setPendingCurrencyChange] = useState<{ currencies: string[]; index: number; previousValue: string } | null>(null);
  // Локальний стан для відображення валют у select (для відновлення при скасуванні)
  const [displayCurrencies, setDisplayCurrencies] = useState<string[]>(selectedCurrencies);
  // Стан для згортання/розгортання секції локальної взаємодії
  const [isLocalInteractionExpanded, setIsLocalInteractionExpanded] = useState(false);
  // Стан для згортання/розгортання секції курсів обміну (за замовчуванням відкрита, далі — з localStorage)
  const exchangeRatesExpandedStorageKey = 'settings_exchangeRates_expanded';
  const settingsPanelExpandedStorageKey = 'settings_panel_expanded';
  const [isExchangeRatesExpanded, setIsExchangeRatesExpanded] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true;
      const stored = window.localStorage.getItem(exchangeRatesExpandedStorageKey);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  });
  const [isSettingsPanelExpanded, setIsSettingsPanelExpanded] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return true;
      const stored = window.localStorage.getItem(settingsPanelExpandedStorageKey);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  });

  // Auto-fetch курси НБУ (зберігається в localStorage)
  const autoFetchNbuRatesStorageKey = 'settings_exchangeRates_autoFetchNbuRates';
  const [isAutoFetchNbuRatesEnabled, setIsAutoFetchNbuRatesEnabled] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false;
      const stored = window.localStorage.getItem(autoFetchNbuRatesStorageKey);
      if (stored === null) return false;
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showMultiMonthModal, setShowMultiMonthModal] = useState(false);
  const [showForecastModal, setShowForecastModal] = useState(false);

  // Імпорт транзакцій з CSV-виписки (Monobank або сумісний формат)
  const csvFileInputRef = React.useRef<HTMLInputElement>(null);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvParseResult, setCsvParseResult] = useState<CsvParseResult | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvImportMessage, setCsvImportMessage] = useState('');

  const handleCsvFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;
      const result = parseTransactionsCsv(text, selectedCurrencies[0] || 'UAH');
      setCsvParseResult(result);
      setCsvFileName(file.name);
      setShowCsvImportModal(true);
    };
    reader.onerror = () => {
      setCsvImportMessage(t('errors.readError'));
      setTimeout(() => setCsvImportMessage(''), 4000);
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  };

  const handleCsvImported = (count: number) => {
    setCsvImportMessage(t('csvImport.importedMessage', { count }));
    setTimeout(() => setCsvImportMessage(''), 5000);
  };
  
  // Синхронізуємо displayCurrencies з selectedCurrencies, коли немає pending зміни
  React.useEffect(() => {
    if (!showCurrencyChangeConfirm) {
      setDisplayCurrencies(selectedCurrencies);
    }
  }, [selectedCurrencies, showCurrencyChangeConfirm]);

  const toggleExchangeRatesExpanded = () => {
    setIsExchangeRatesExpanded(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(exchangeRatesExpandedStorageKey, String(next));
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleRegionChange = (countryCode: string) => {
    setSelectedRegionCode(countryCode);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(REGION_CURRENCY_STORAGE_KEY, countryCode);
      }
    } catch {
      // ignore storage errors
    }

    if (handleUpdateNbuRates && !isUpdatingRates) {
      void handleUpdateNbuRates();
    }
  };

  const needsNbuFetch = React.useCallback((): boolean => {
    try {
      const cached = localStorage.getItem('nbu_rates_cache');
      if (!cached) return true;
      const data = JSON.parse(cached);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return data.date !== todayStr;
    } catch {
      return true;
    }
  }, []);

  // Auto-fetch on mount: fetch only when today's rates are missing
  useEffect(() => {
    if (!isAutoFetchNbuRatesEnabled) return;
    if (!handleUpdateNbuRates) return;
    if (isUpdatingRates) return;
    if (!needsNbuFetch()) return;

    void handleUpdateNbuRates();
  }, [isAutoFetchNbuRatesEnabled, handleUpdateNbuRates, isUpdatingRates, needsNbuFetch]);

  // Re-check when tab becomes visible (e.g. next day)
  useEffect(() => {
    if (!isAutoFetchNbuRatesEnabled) return;
    if (!handleUpdateNbuRates) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (isUpdatingRates) return;
      if (!needsNbuFetch()) return;
      void handleUpdateNbuRates();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAutoFetchNbuRatesEnabled, handleUpdateNbuRates, isUpdatingRates, needsNbuFetch]);

  // Guided tour: transiently expand every collapsible section so the tour can
  // point at inner controls (currencies, rates, region, import/export). We do
  // not persist these expansions — it is purely so the walkthrough can anchor.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expandAll = () => {
      setIsSettingsPanelExpanded(true);
      setIsExchangeRatesExpanded(true);
      setIsLocalInteractionExpanded(true);
    };
    window.addEventListener(TOUR_EXPAND_SECTIONS_EVENT, expandAll);
    return () => window.removeEventListener(TOUR_EXPAND_SECTIONS_EVENT, expandAll);
  }, []);
  
  const handleCurrencySelect = (currencyCode: string, index: number) => {
    const previousValue = selectedCurrencies[index];
    
    // Перевіряємо, чи валюта дійсно змінилася
    if (currencyCode === previousValue) {
      return; // Валюта не змінилася, нічого не робимо
    }
    
    // Оновлюємо локальний стан для відображення
    const newDisplayCurrencies = [...displayCurrencies];
    newDisplayCurrencies[index] = currencyCode;
    setDisplayCurrencies(newDisplayCurrencies);
    
    // Перевіряємо, чи є транзакції з валютою, яку намагаються змінити (в усіх місцях бюджету)
    const hasTransactionsWithCurrency = (currencyUsage[previousValue] || 0) > 0;

    // Зберігаємо нові валюти
    const newCurrencies = [...selectedCurrencies];
    newCurrencies[index] = currencyCode;

    // Показуємо попап тільки якщо є транзакції з цією валютою
    if (hasTransactionsWithCurrency) {
      setPendingCurrencyChange({ currencies: newCurrencies, index, previousValue });
      setShowCurrencyChangeConfirm(true);
    } else {
      // Якщо немає транзакцій, просто змінюємо валюту без попапу
      if (handleCurrencyChange) {
        handleCurrencyChange(newCurrencies);
      }
    }
  };

  // Цільові валюти для транзакцій тієї валюти, яку замінюють: нова валюта
  // та дві валюти, що залишилися у відстеженні.
  const pendingMigrationTargets = React.useMemo(() => {
    if (!pendingCurrencyChange) return [] as string[];
    return pendingCurrencyChange.currencies.filter(
      (code, index) =>
        index !== pendingCurrencyChange.index &&
        code !== pendingCurrencyChange.previousValue
    );
  }, [pendingCurrencyChange]);

  const applyPendingCurrencyChange = (mode: CurrencyMigrationMode, target?: string) => {
    if (pendingCurrencyChange && handleCurrencyChange) {
      const nextCurrency = target || pendingCurrencyChange.currencies[pendingCurrencyChange.index];
      handleCurrencyChange(pendingCurrencyChange.currencies, [
        { from: pendingCurrencyChange.previousValue, to: nextCurrency, mode }
      ]);
    }
    setShowCurrencyChangeConfirm(false);
    setPendingCurrencyChange(null);
  };

  // «Сирітські» транзакції: валюти поза вибраними трьома (напр. залишки EUR після переходу на CZK).
  const applyOrphanMigration = (mode: CurrencyMigrationMode, target?: string) => {
    if (!handleCurrencyChange || orphanCurrencyUsage.length === 0) return;
    const targetCurrency = target || orphanTargetCurrency || selectedCurrencies[0];
    if (!targetCurrency) return;
    handleCurrencyChange(
      selectedCurrencies,
      orphanCurrencyUsage.map(({ code }) => ({ from: code, to: targetCurrency, mode }))
    );
  };
  
  const handleCancelCurrencyChange = () => {
    // Відновлюємо попереднє значення
    if (pendingCurrencyChange) {
      const restoredCurrencies = [...displayCurrencies];
      restoredCurrencies[pendingCurrencyChange.index] = pendingCurrencyChange.previousValue;
      setDisplayCurrencies(restoredCurrencies);
    }
    setShowCurrencyChangeConfirm(false);
    setPendingCurrencyChange(null);
  };

  return (
    <div
      className={`ui-panel bg-white/90 backdrop-blur rounded-2xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6 border border-slate-200 ${
        readOnly ? 'opacity-[0.88] pointer-events-none' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-0">
        <button
          type="button"
          onClick={() => {
            const next = !isSettingsPanelExpanded;
            setIsSettingsPanelExpanded(next);
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(settingsPanelExpandedStorageKey, String(next));
              }
            } catch {
              // ignore storage errors
            }
          }}
          className="flex-1 flex items-center justify-between gap-2 text-left focus:outline-none rounded-lg"
          aria-expanded={isSettingsPanelExpanded}
        >
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
            <span className="mr-2">⚙️</span> {t('settings.title')}
          </h2>
          <span className="text-gray-600 text-lg transition-transform duration-200 shrink-0" aria-hidden="true">
            {isSettingsPanelExpanded ? '▼' : '▶'}
          </span>
        </button>
        <InfoTip text={t('infoTips.settings')} />
      </div>

      {isSettingsPanelExpanded && (
      <div className="mt-4">
      {/* Currency Selector */}
      <div className="mb-4 sm:mb-6" data-tour="settings-currency">
        <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-700 mb-2">
          {t('settings.currency.selection')}
          <InfoTip text={t('infoTips.currency')} />
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {displayCurrencies.map((currencyCode, index) => {
            const availableCurrencies = Object.keys(AVAILABLE_CURRENCIES);
            
            return (
              <div key={index} className="relative">
                <select
                  value={currencyCode}
                  onChange={(e) => handleCurrencySelect(e.target.value, index)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                >
                  {availableCurrencies.map(code => {
                    const isSelected = displayCurrencies.includes(code) && code !== currencyCode;
                    const regionLabel = getCurrencyRegionLabel(code, currencyLanguage);
                    return (
                      <option 
                        key={code} 
                        value={code} 
                        disabled={isSelected}
                      >
                        {code} - {getCurrencyName(code, currencyLanguage)}{regionLabel ? ` (${regionLabel})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>

        {orphanTransactionTotal > 0 && !readOnly && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="text-xs sm:text-sm font-semibold text-amber-800 mb-1">
              ⚠️ {t('settings.currency.orphans.title')}
            </div>
            <p className="text-xs text-amber-700 mb-2">
              {t('settings.currency.orphans.message', {
                count: orphanTransactionTotal,
                currencies: orphanCurrencyUsage.map(item => `${item.code} (${item.count})`).join(', ')
              })}
            </p>
            {orphanTransactionLocations.length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-white/70 p-2">
                <button
                  type="button"
                  onClick={() => setShowOrphanLocations(prev => !prev)}
                  className="w-full flex items-center justify-between gap-2 text-left text-[11px] sm:text-xs font-semibold text-amber-800"
                  aria-expanded={showOrphanLocations}
                >
                  <span>
                    {showOrphanLocations
                      ? t('settings.currency.orphans.hideLocations')
                      : t('settings.currency.orphans.showLocations', {
                          months: orphanTransactionLocations.length
                        })}
                  </span>
                  <span aria-hidden="true">{showOrphanLocations ? '▼' : '▶'}</span>
                </button>
                {showOrphanLocations && (
                  <ul className="mt-2 space-y-1.5">
                    {orphanTransactionLocations.map(group => (
                      <li key={group.key}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] sm:text-xs font-bold text-amber-900">
                            {group.label}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-semibold text-amber-700 tabular-nums">
                            {t('settings.currency.orphans.monthTotal', { count: group.total })}
                          </span>
                        </div>
                        <ul className="ml-3 mt-0.5 space-y-0.5">
                          {group.entries.map((entry, index) => (
                            <li
                              key={`${group.key}-${index}`}
                              className="flex items-baseline justify-between gap-2 text-[10px] sm:text-[11px] text-amber-700"
                            >
                              <span>{entry.label}</span>
                              <span className="font-semibold tabular-nums">{entry.codes}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <label className="block text-[11px] sm:text-xs font-semibold text-amber-800 mb-1">
              {t('settings.currency.orphans.targetLabel')}
            </label>
            <select
              value={orphanTargetCurrency}
              onChange={(e) => setOrphanTargetCurrency(e.target.value)}
              className="w-full mb-2 px-2 py-2 text-xs sm:text-sm border-2 border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            >
              {selectedCurrencies.map(code => (
                <option key={code} value={code}>
                  {code} - {getCurrencyName(code, currencyLanguage)}
                </option>
              ))}
            </select>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => applyOrphanMigration('convert')}
                disabled={!orphanTargetCurrency}
                className="flex-1 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all active:scale-95"
              >
                {t('settings.currency.orphans.convert', { currency: orphanTargetCurrency || '—' })}
              </button>
              <button
                type="button"
                onClick={() => applyOrphanMigration('delete')}
                className="flex-1 px-3 py-2 text-xs sm:text-sm font-bold rounded-lg text-white bg-rose-500 hover:bg-rose-600 transition-all active:scale-95"
              >
                {t('settings.currency.orphans.delete')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Initial Balances */}
      <div className="mb-4 sm:mb-6" data-tour="settings-balances">
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            {t('settings.balances.title')}
            <InfoTip text={t('infoTips.balances')} />
          </label>
          <button
            type="button"
            onClick={() => {
              setStartBalanceFocusCode(null);
              setStartBalanceDraftByCode({});
              handleClearStartBalances();
            }}
            disabled={readOnly}
            className={`shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              readOnly
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border border-orange-500 shadow-md hover:shadow-lg active:scale-95'
            }`}
          >
            {t('settings.balances.clear')}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {selectedCurrencies.map((currencyCode, index) => {
            const currency = AVAILABLE_CURRENCIES[currencyCode];
            if (!currency) return null;
            
            // Отримуємо поточний баланс для валюти з бюджету
            const activeBudget = safeBudgets && safeBudgets[activeBudgetId || 'default'];
            const currentBalance = activeBudget?.startBalances?.[currencyCode] ?? null;
            const startBalanceDisplayValue =
              startBalanceFocusCode === currencyCode
                ? (startBalanceDraftByCode[currencyCode] ?? '')
                : currentBalance === null || currentBalance === undefined
                  ? ''
                  : formatNumber(currentBalance, 2);
            const calculatedBalance = calculatedMonthBudgets?.[currencyCode];
            
            const colors = [
              'from-blue-50 to-blue-100/70 border-blue-200 hover:border-blue-300',
              'from-emerald-50 to-green-100/70 border-emerald-200 hover:border-emerald-300',
              'from-amber-50 to-yellow-100/70 border-amber-200 hover:border-amber-300'
            ];
            const colorClass = colors[index % colors.length];
            const balancesLocked = readOnly;
            
            return (
              <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 sm:p-4 rounded-xl border-2 transition-all`}>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
                  <CurrencyFlag currencyCode={currencyCode} size={16} className="mr-1" /> {t('settings.balances.startingBudget')} ({currencyCode})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={balancesLocked}
                  value={startBalanceDisplayValue}
                  onFocus={() => {
                    if (balancesLocked) return;
                    setStartBalanceFocusCode(currencyCode);
                    setStartBalanceDraftByCode((prev) => ({
                      ...prev,
                      [currencyCode]:
                        currentBalance === null || currentBalance === undefined
                          ? ''
                          : formatNumber(currentBalance, 2)
                    }));
                  }}
                  onBlur={() => {
                    setStartBalanceFocusCode((prev) => (prev === currencyCode ? null : prev));
                  }}
                  onChange={(e) => {
                    if (balancesLocked) return;
                    const v = e.target.value;
                    setStartBalanceDraftByCode((prev) => ({ ...prev, [currencyCode]: v }));
                    handleStartBalanceChange?.(currencyCode, v);
                  }}
                  placeholder="0.00"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base sm:text-lg font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                />
                {calculatedMonthBudgets && (() => {
                  const amountText =
                    calculatedBalance === null || calculatedBalance === undefined
                      ? '—'
                      : formatNumber(calculatedBalance, 2);
                  const amountTone =
                    calculatedBalance === null || calculatedBalance === undefined
                      ? 'text-gray-400'
                      : calculatedBalance < 0
                        ? 'text-rose-600'
                        : 'text-emerald-700';
                  const monthLabel = t('settings.balances.monthBudget', {
                    month: selectedMonthLabel
                  });

                  return (
                    <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white/70 px-2.5 py-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] sm:text-xs text-slate-600">{monthLabel}</span>
                        <span className={`text-sm font-bold tabular-nums ${amountTone}`}>
                          {amountText}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={toggleExchangeRatesExpanded}
            className="flex-1 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg p-1 -m-1"
          >
            <span className="block text-xs sm:text-sm font-semibold text-gray-700">
              {t('settings.exchangeRates.title')}
            </span>
            <span className="text-gray-600 text-lg transition-transform duration-200">
              {isExchangeRatesExpanded ? '▼' : '▶'}
            </span>
          </button>
          <InfoTip text={t('infoTips.exchangeRates')} />
        </div>

        {isExchangeRatesExpanded && (
          <>
            {/* Region selector */}
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" data-tour="settings-region">
              <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-800 mb-1">
                {t('settings.exchangeRates.region.label')}
                <InfoTip text={t('infoTips.region')} />
              </label>
              <select
                value={selectedRegionCode}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="w-full px-3 py-2 sm:py-2.5 text-sm sm:text-base border-2 border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
              >
                <option value={REGION_AUTO_VALUE}>
                  {t('settings.exchangeRates.region.auto')}
                </option>
                {regionOptions.map(region => (
                  <option key={region.countryCode} value={region.countryCode}>
                    {region.countryName[currencyLanguage]} - {region.currencyCode} ({getCurrencyName(region.currencyCode, currencyLanguage)})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] sm:text-xs text-gray-600">
                {regionalCurrency
                  ? t('settings.exchangeRates.region.selectedHint', {
                      country: regionalCurrency.countryName[currencyLanguage],
                      currency: regionalCurrency.currencyCode
                    })
                  : t('settings.exchangeRates.region.noRegionHint')}
              </p>
            </div>

            {/* Auto fetch toggle */}
            {handleUpdateNbuRates && (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" data-tour="settings-autofetch">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    {t('settings.exchangeRates.autoFetch.label')}
                    <InfoTip text={t('infoTips.autoFetch')} />
                  </div>
                </div>
                <label className="inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAutoFetchNbuRatesEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsAutoFetchNbuRatesEnabled(next);
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem(autoFetchNbuRatesStorageKey, String(next));
                        }
                      } catch {
                        // ignore storage errors
                      }
                      // Якщо увімкнули вручну — одразу підвантажимо курси
                      if (next && handleUpdateNbuRates && !isUpdatingRates) {
                        void handleUpdateNbuRates();
                      }
                    }}
                  />
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isAutoFetchNbuRatesEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        isAutoFetchNbuRatesEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-4">
              {exchangeRateCurrencies.map((currencyCode, index) => {
                if (currencyCode === baseCurrency) return null; // Не показуємо курс базової валюти до самої себе
                
                const pairKey = `${baseCurrency}_${currencyCode}`;
                const reversePairKey = `${currencyCode}_${baseCurrency}`;
                
                let buyRate, sellRate;
                const pairValue = exchangeRates[pairKey];
                const reversePairValue = exchangeRates[reversePairKey];
                
                if (isExchangeRatePair(pairValue)) {
                  buyRate = pairValue.buy || 0;
                  sellRate = pairValue.sell ? roundToDecimals(pairValue.sell, 2) : 0;
                } else if (isExchangeRatePair(reversePairValue)) {
                  sellRate = reversePairValue.buy ? roundToDecimals(1 / reversePairValue.buy, 2) : 0;
                  buyRate = reversePairValue.sell ? 1 / reversePairValue.sell : 0;
                } else {
                  const rateVal = exchangeRates[currencyCode];
                  let oldRate: number | undefined;
                  if (typeof rateVal === 'number') {
                      oldRate = rateVal;
                  } else if (isExchangeRatePair(rateVal)) {
                      oldRate = getBuyRate(rateVal, 0);
                  } else {
                      // Отримуємо курс з exchangeRates
                      const pairKey = `${baseCurrency}_${currencyCode}`;
                      const ratePair = exchangeRates[pairKey];
                      if (isExchangeRatePair(ratePair)) {
                        oldRate = ratePair.buy;
                      } else if (typeof ratePair === 'number') {
                        oldRate = ratePair;
                      } else {
                        // Якщо курсу немає, не встановлюємо дефолтне значення
                        oldRate = undefined;
                      }
                  }
                  buyRate = oldRate ?? 0;
                  sellRate = oldRate ? roundToDecimals(oldRate * 1.01, 2) : 0;
                }
                
                const colors = [
                  'from-violet-50 to-indigo-100/70 border-violet-200',
                  'from-fuchsia-50 to-purple-100/70 border-fuchsia-200',
                  'from-rose-50 to-pink-100/70 border-rose-200'
                ];
                const colorClass = colors[index % colors.length];
                
                return (
                  <div key={currencyCode} className={`bg-gradient-to-br ${colorClass} p-3 sm:p-4 rounded-xl border-2 hover:border-opacity-70 transition-all`}>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-3">
                      <CurrencyFlag currencyCode={baseCurrency} size={16} className="mr-1" /> {baseCurrency} ↔ <CurrencyFlag currencyCode={currencyCode} size={16} className="ml-1" /> {currencyCode}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Купівля */}
                      <div>
                        <label className="block text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                          {t('settings.exchangeRates.buy')} ({baseCurrency} → {currencyCode})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={buyRate === 0 ? '' : buyRate}
                          onChange={(e) => {
                            const newRate = parseFloat(sanitizeNumberInput(e.target.value)) || 0;
                            if (handleExchangeRateChange) {
                              handleExchangeRateChange(pairKey, 'buy', newRate);
                            }
                          }}
                          className="w-full px-2 sm:px-3 py-2 text-sm sm:text-base font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                        />
                      </div>
                      {/* Продаж */}
                      <div>
                        <label className="block text-[10px] sm:text-xs font-semibold text-gray-600 mb-1">
                          {t('settings.exchangeRates.sell')} ({currencyCode} → {baseCurrency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={sellRate === 0 ? '' : sellRate}
                          onChange={(e) => {
                            const newRate = parseFloat(sanitizeNumberInput(e.target.value)) || 0;
                            if (handleExchangeRateChange) {
                              handleExchangeRateChange(pairKey, 'sell', newRate);
                            }
                          }}
                          className="w-full px-2 sm:px-3 py-2 text-sm sm:text-base font-semibold border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
              {t('settings.exchangeRates.description')}
            </p>
            {/* Кнопка оновлення курсів НБУ */}
            {handleUpdateNbuRates && (
              <div className="mt-3" data-tour="settings-update-rates">
                <button
                  type="button"
                  onClick={handleUpdateNbuRates}
                  disabled={isUpdatingRates}
                  className={`w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm ${
                    isUpdatingRates
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl active:scale-95'
                  }`}
                >
                  {isUpdatingRates
                    ? t('settings.exchangeRates.updating')
                    : t('settings.exchangeRates.update')}
                </button>
                {rateUpdateMessage && (
                  <span
                    className={`block mt-2 text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg ${
                      rateUpdateMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                    }`}
                  >
                    {rateUpdateMessage}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 sm:space-y-4">
        {/* Для локальної взаємодії */}
        <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-3 sm:p-4 rounded-xl border-2 border-slate-200" data-tour="settings-local">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => setIsLocalInteractionExpanded(!isLocalInteractionExpanded)}
              className="flex-1 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg p-1 -m-1"
            >
              <h3 className="text-xs sm:text-sm font-bold text-gray-800 flex items-center">
                <span className="mr-2">💾</span>{' '}
                {t('settings.localInteraction.title')}
              </h3>
              <span className="text-gray-600 text-lg transition-transform duration-200">
                {isLocalInteractionExpanded ? '▼' : '▶'}
              </span>
            </button>
            <InfoTip text={t('infoTips.localInteraction')} />
          </div>
          {isLocalInteractionExpanded && (
            <div className="space-y-3 mt-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleExportToJsonFile}
                  className="flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-xl active:scale-95"
                >
                  {t('settings.localInteraction.export')}
                </button>
                <button
                  type="button"
                  onClick={handleImportFromJsonFile}
                  disabled={isLoading}
                  className={`btn-import-json flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm ${
                    isLoading
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg hover:shadow-xl active:scale-95'
                  }`}
                >
                  {isLoading
                    ? t('settings.localInteraction.importing')
                    : t('settings.localInteraction.import')}
                </button>
              </div>
              {onExportPdf && (
                <button
                  type="button"
                  onClick={onExportPdf}
                  className="w-full px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-lg hover:shadow-xl active:scale-95"
                >
                  {t('settings.localInteraction.exportPdf')}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  disabled={!updateDay || !days || days.length === 0 || readOnly}
                  className={`flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all text-xs sm:text-sm ${
                    !updateDay || !days || days.length === 0 || readOnly
                      ? 'bg-gray-400 cursor-not-allowed text-white'
                      : 'bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl active:scale-95'
                  }`}
                >
                  {t('csvImport.importButtonLabel')}
                </button>
                <InfoTip text={t('infoTips.csvImport')} />
              </div>
              <input
                type="file"
                accept="application/json"
                ref={fileInputRef}
                onChange={handleJsonFileSelected}
                className="hidden"
              />
              <input
                type="file"
                accept=".csv,text/csv"
                ref={csvFileInputRef}
                onChange={handleCsvFileSelected}
                className="hidden"
              />
              {csvImportMessage && (
                <span className="block text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg text-green-700 bg-green-100">
                  {csvImportMessage}
                </span>
              )}
              {saveMessage && (
                <span
                  className={`block text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg whitespace-pre-line ${
                    saveMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                  }`}
                >
                  {saveMessage}
                </span>
              )}
              {loadMessage && (
                <span
                  className={`block text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg ${
                    loadMessage.includes('✅') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                  }`}
                >
                  {loadMessage}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Очищення даних */}
        <div className="space-y-2 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-4">
            <div className="w-full sm:flex-1 min-w-[10rem] flex items-center gap-1.5">
              <button
                onClick={() =>
                  handleClearAllDays(budgetViewMode === 'months' ? 'all-months' : 'current-month')
                }
                className="flex-1 px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl active:scale-95"
              >
                {budgetViewMode === 'months'
                  ? t('settings.clearAllDays')
                  : t('settings.clearMonthDays')}
              </button>
              <InfoTip text={t('infoTips.clearDays')} />
            </div>
            <div className="w-full sm:flex-1 min-w-[10rem] flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (budgetViewMode === 'months') {
                    setShowMultiMonthModal(true);
                  } else {
                    setShowRecurringModal(true);
                  }
                }}
                disabled={
                  budgetViewMode === 'months'
                    ? !onBulkAddTransactionsToMonths || readOnly
                    : !updateDay || !days || days.length === 0
                }
                className={`flex-1 px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base text-white shadow-lg hover:shadow-xl active:scale-95 ${
                  budgetViewMode === 'months'
                    ? onBulkAddTransactionsToMonths && !readOnly
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-gray-400 cursor-not-allowed'
                    : !updateDay || !days || days.length === 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
                title={t('transaction.add')}
              >
                <span className="mr-2">➕</span>
                {t('transaction.add')}
              </button>
              <InfoTip text={t('infoTips.addTransaction')} />
            </div>
            <div className="w-full sm:flex-1 min-w-[10rem] flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowForecastModal(true)}
                disabled={!onForecastCopyToMonths || readOnly}
                className={`flex-1 px-4 sm:px-6 py-3 rounded-xl font-bold transition-all text-sm sm:text-base text-white shadow-lg hover:shadow-xl active:scale-95 ${
                  onForecastCopyToMonths && !readOnly
                    ? 'bg-indigo-500 hover:bg-indigo-600'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
                title={t('budgetForecast.button')}
              >
                <span className="mr-2">📅</span>
                {t('budgetForecast.button')}
              </button>
              <InfoTip text={t('infoTips.forecast')} />
            </div>
          </div>
        </div>
      </div>
      </div>
      )}
      
      {/* Модальне вікно підтвердження зміни валюти: конвертувати чи видалити */}
      {showCurrencyChangeConfirm && pendingCurrencyChange && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={handleCancelCurrencyChange}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full mx-4 border-2 border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 flex items-center">
              <span className="mr-2">⚠️</span> {t('settings.currency.changeConfirm.title')}
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-2">
              {t('settings.currency.changeConfirm.message', {
                count: currencyUsage[pendingCurrencyChange.previousValue] || 0,
                from: pendingCurrencyChange.previousValue,
                to: pendingCurrencyChange.currencies[pendingCurrencyChange.index]
              })}
            </p>
            <p className="text-xs text-gray-500 mb-6">
              {t('settings.currency.changeConfirm.convertHint', {
                from: pendingCurrencyChange.previousValue
              })}
            </p>
            <div className="flex flex-col gap-3">
              {pendingMigrationTargets.map(targetCurrency => (
                <button
                  key={targetCurrency}
                  type="button"
                  onClick={() => applyPendingCurrencyChange('convert', targetCurrency)}
                  className="w-full px-4 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all"
                >
                  {t('settings.currency.changeConfirm.convertTo', { currency: targetCurrency })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPendingCurrencyChange('delete')}
                className="w-full px-4 py-3 rounded-lg font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-all"
              >
                {t('settings.currency.changeConfirm.delete')}
              </button>
              <button
                type="button"
                onClick={handleCancelCurrencyChange}
                className="w-full px-4 py-3 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
              >
                {t('settings.currency.changeConfirm.cancel')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <BulkTransactionModal
        isOpen={showRecurringModal && budgetViewMode === 'days'}
        onClose={() => setShowRecurringModal(false)}
        days={days}
        updateDay={updateDay || (() => {})}
        selectedCurrencies={selectedCurrencies}
        budgetYear={budgetYear}
        budgetMonth={budgetMonth}
      />

      <CsvImportModal
        isOpen={showCsvImportModal}
        onClose={() => setShowCsvImportModal(false)}
        fileName={csvFileName}
        parseResult={csvParseResult}
        days={days}
        updateDay={updateDay || (() => {})}
        selectedCurrencies={selectedCurrencies}
        budgetYear={budgetYear}
        budgetMonth={budgetMonth}
        onImported={handleCsvImported}
      />

      <MultiMonthBulkTransactionModal
        isOpen={showMultiMonthModal && budgetViewMode === 'months'}
        onClose={() => setShowMultiMonthModal(false)}
        onSave={(draft) => onBulkAddTransactionsToMonths?.(draft)}
        monthsByKey={monthsByKey}
        activeMonthKey={activeMonthKey}
        activeMonthDays={days}
        selectedCurrencies={selectedCurrencies}
        isUk={isUk}
      />

      <BudgetForecastModal
        isOpen={showForecastModal}
        onClose={() => setShowForecastModal(false)}
        onSave={(draft) => onForecastCopyToMonths?.(draft)}
        monthsByKey={monthsByKey}
        activeMonthKey={activeMonthKey}
        activeMonthDays={days}
        selectedCurrencies={selectedCurrencies}
        isUk={isUk}
      />
    </div>
  );
};

export default React.memo(SettingsCard);
