import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Day, ExchangeRates, MonthSlice } from '../types';
import { formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { capitalizeFirstLetter, getMonthYearLabel } from '../utils/dateHelpers';
import {
  buildPdfExportFileName,
  buildPdfReportData,
  defaultSelectedPdfMonthKeys,
  listPdfExportableMonths
} from '../utils/budgetPdfReportData';
import { overviewMonthHasTransactions } from '../utils/budgetInsights';
import InfoTip from './InfoTip';
import { PdfIncomeExpenseChart } from './PdfReportChartCanvases';
import PdfReportPages, { PDF_REPORT_PAGE_ATTR } from './PdfReportPages';

interface ExportPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthsByKey?: Record<string, MonthSlice>;
  activeMonthKey: string;
  activeDays: Day[];
  activeStartBalances: Record<string, number | null>;
  selectedCurrencies: string[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  budgetName: string;
}

const ExportPdfReportModal: React.FC<ExportPdfReportModalProps> = ({
  isOpen,
  onClose,
  monthsByKey,
  activeMonthKey,
  activeDays,
  activeStartBalances,
  selectedCurrencies,
  displayCurrency,
  exchangeRates,
  budgetName
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'uk';
  const captureRootRef = useRef<HTMLDivElement>(null);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | ''>('');

  const monthContext = useMemo(
    () => ({ monthsByKey, activeMonthKey, activeDays }),
    [monthsByKey, activeMonthKey, activeDays]
  );

  const availableMonths = useMemo(
    () => listPdfExportableMonths(monthContext),
    [monthContext]
  );

  const monthLabels = useMemo(() => {
    const map: Record<string, string> = {};
    availableMonths.forEach((month) => {
      map[month.key] = capitalizeFirstLetter(
        getMonthYearLabel(locale, month.year, month.month)
      );
    });
    return map;
  }, [availableMonths, locale]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedMonthKeys(new Set(defaultSelectedPdfMonthKeys(availableMonths, monthContext)));
    setIsGenerating(false);
    setStatusMessage('');
    setStatusKind('');
  }, [isOpen, availableMonths, monthContext]);

  const selectedKeysSorted = useMemo(
    () => availableMonths.map((month) => month.key).filter((key) => selectedMonthKeys.has(key)),
    [availableMonths, selectedMonthKeys]
  );

  const reportData = useMemo(() => {
    if (!isOpen || selectedKeysSorted.length === 0) return null;
    return buildPdfReportData({
      monthKeys: selectedKeysSorted,
      availableMonths,
      monthsByKey,
      activeMonthKey,
      activeDays,
      activeStartBalances,
      selectedCurrencies,
      displayCurrency,
      exchangeRates,
      budgetName,
      locale
    });
  }, [
    isOpen,
    selectedKeysSorted,
    availableMonths,
    monthsByKey,
    activeMonthKey,
    activeDays,
    activeStartBalances,
    selectedCurrencies,
    displayCurrency,
    exchangeRates,
    budgetName,
    locale
  ]);

  const toggleMonth = (key: string) => {
    setSelectedMonthKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllMonths = () => {
    setSelectedMonthKeys(new Set(availableMonths.map((month) => month.key)));
  };

  const selectFilledMonths = () => {
    setSelectedMonthKeys(
      new Set(
        defaultSelectedPdfMonthKeys(availableMonths, monthContext)
      )
    );
  };

  const clearMonths = () => setSelectedMonthKeys(new Set());

  const formatAxis = useCallback(
    (value: number) => formatNumber(value, value >= 100 ? 0 : 2),
    []
  );

  const handleGenerate = async () => {
    if (!reportData || selectedKeysSorted.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setStatusMessage('');
    setStatusKind('');

    try {
      const root = captureRootRef.current;
      const pages = Array.from(
        root?.querySelectorAll<HTMLElement>(`[${PDF_REPORT_PAGE_ATTR}]`) || []
      );
      if (!root || pages.length === 0) {
        throw new Error('missing-pages');
      }

      const previousLeft = root.style.left;
      const previousTop = root.style.top;
      const previousZ = root.style.zIndex;
      root.style.left = '0px';
      root.style.top = '0px';
      root.style.zIndex = '1';

      try {
        const { captureReportPagesToPdf, downloadPdfBlob } = await import('../utils/exportBudgetPdf');
        const blob = await captureReportPagesToPdf(pages);
        const filename = buildPdfExportFileName(
          reportData.budgetName,
          reportData.months,
          reportData.generatedAt
        );
        const result = await downloadPdfBlob(blob, filename, t('pdfExport.fileType'));
        if (result === 'cancelled') {
          setStatusKind('error');
          setStatusMessage(t('importExport.saveCancelled'));
          return;
        }
        setStatusKind('ok');
        setStatusMessage(t('importExport.fileSavedWithFilename', { filename }));
        window.setTimeout(() => onClose(), 900);
      } finally {
        root.style.left = previousLeft;
        root.style.top = previousTop;
        root.style.zIndex = previousZ;
      }
    } catch (error) {
      console.error('PDF export failed:', error);
      setStatusKind('error');
      setStatusMessage(t('pdfExport.error'));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const symbol = getCurrencySymbol(displayCurrency);
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isGenerating) onClose();
  };

  const modal = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white w-full h-full sm:h-auto sm:w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 border-0 sm:border-2 border-violet-200 sm:max-h-[92vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 font-display">
              {t('pdfExport.title')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t('pdfExport.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <InfoTip text={t('infoTips.pdfExport')} />
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold leading-none"
              aria-label={t('common.cancel')}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold text-gray-700">
            {t('pdfExport.selectMonths')}
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={selectFilledMonths}
              className="px-2 py-1 rounded bg-violet-100 text-violet-800 font-semibold hover:bg-violet-200"
            >
              {t('pdfExport.selectFilled')}
            </button>
            <button
              type="button"
              onClick={selectAllMonths}
              className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200"
            >
              {t('pdfExport.selectAll')}
            </button>
            <button
              type="button"
              onClick={clearMonths}
              className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
            >
              {t('pdfExport.clearSelection')}
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-2 border-2 border-violet-200 max-h-44 overflow-y-auto mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {availableMonths.map((month) => {
              const checked = selectedMonthKeys.has(month.key);
              const hasData = overviewMonthHasTransactions(month, monthContext);
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => toggleMonth(month.key)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all text-left ${
                    checked
                      ? 'bg-violet-600 text-white border-violet-700 shadow'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-violet-100'
                  }`}
                  aria-pressed={checked}
                >
                  <span className="block truncate">
                    {checked ? '✓ ' : ''}
                    {monthLabels[month.key]}
                  </span>
                  <span className={`block text-[10px] mt-0.5 ${checked ? 'text-violet-100' : 'text-gray-400'}`}>
                    {hasData ? t('pdfExport.hasData') : t('pdfExport.emptyMonth')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {reportData ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                  {t('pdfExport.income')}
                </div>
                <div className="text-sm font-extrabold text-emerald-700 tabular-nums">
                  {symbol}{formatNumber(reportData.totals.income, 2)}
                </div>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5">
                <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">
                  {t('pdfExport.expense')}
                </div>
                <div className="text-sm font-extrabold text-rose-700 tabular-nums">
                  {symbol}{formatNumber(reportData.totals.expense, 2)}
                </div>
              </div>
              <div className={`rounded-xl p-2.5 border ${
                reportData.totals.net >= 0
                  ? 'bg-teal-50 border-teal-200'
                  : 'bg-rose-50 border-rose-200'
              }`}>
                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                  {t('pdfExport.net')}
                </div>
                <div className={`text-sm font-extrabold tabular-nums ${
                  reportData.totals.net >= 0 ? 'text-teal-700' : 'text-rose-700'
                }`}>
                  {symbol}{formatNumber(reportData.totals.net, 2)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-2 mb-4 overflow-x-auto">
              <p className="text-xs font-bold text-gray-700 px-1 mb-1">{t('pdfExport.preview')}</p>
              <PdfIncomeExpenseChart
                months={reportData.months.map((month) => ({
                  label: month.shortLabel,
                  income: month.income,
                  expense: month.expense
                }))}
                width={640}
                height={196}
                incomeLabel={t('pdfExport.legendIncome')}
                expenseLabel={t('pdfExport.legendExpense')}
                formatValue={formatAxis}
                emptyLabel={t('pdfExport.noData')}
                className="max-w-full h-auto"
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            {t('pdfExport.needMonths')}
          </p>
        )}

        {statusMessage && (
          <p
            className={`text-sm font-semibold px-3 py-2 rounded-lg mb-3 ${
              statusKind === 'ok' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
            }`}
          >
            {statusMessage}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 px-4 py-3 rounded-xl font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!reportData || isGenerating}
            className={`flex-1 px-4 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${
              !reportData || isGenerating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 active:scale-95'
            }`}
          >
            {isGenerating ? t('pdfExport.generating') : t('pdfExport.generate')}
          </button>
        </div>
      </div>
    </div>
  );

  const capturePortal = reportData
    ? createPortal(
        <div
          ref={captureRootRef}
          aria-hidden
          style={{
            position: 'fixed',
            left: -10000,
            top: 0,
            width: 794,
            pointerEvents: 'none',
            zIndex: -1
          }}
        >
          <PdfReportPages data={reportData} />
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {createPortal(modal, document.body)}
      {capturePortal}
    </>
  );
};

export default ExportPdfReportModal;
