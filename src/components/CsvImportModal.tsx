import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { translate } from '../i18n/config';
import { Day, Transaction } from '../types';
import { generateTransactionId } from '../utils/dayHelpers';
import { roundToDecimals } from '../utils/rounding';
import { TRANSACTION_CATEGORIES } from '../utils/categories';
import { CsvParseResult, filterExistingCsvTransactions } from '../utils/csvImport';
import AlertModal from './AlertModal';
import { getMonthYearLabel, capitalizeFirstLetter } from '../utils/dateHelpers';
import {
  MAX_TRANSACTIONS_PER_MONTH,
  countTransactionsInDays
} from '../utils/transactionLimits';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  parseResult: CsvParseResult | null;
  days: Day[];
  updateDay: (index: number, field: string, value: any) => void;
  selectedCurrencies: string[];
  budgetYear: number;
  budgetMonth: number;
  onImported: (count: number) => void;
}

/**
 * Рядок для показу в модалці: транзакції з CSV з однаковою назвою в межах дня
 * автоматично об'єднані в один рядок (sourceCount — скільки їх було).
 */
interface DisplayRow {
  rowIndex: number;
  date: Date;
  day: number;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  sourceCount: number;
}

interface MergeInput {
  type: 'income' | 'expense';
  currency: string;
  amount: number;
  description: string;
  sourceCount: number;
  category?: string;
}

/** Група об'єднання: транзакції одного дня з однаковими типом і валютою. */
interface MergedGroup {
  type: 'income' | 'expense';
  currency: string;
  amount: number;
  description: string;
  sourceCount: number;
  /** Спільна категорія учасників (порожньо, якщо різні). */
  category: string;
  key: string;
}

function buildMergedGroups(
  rows: MergeInput[],
  mergedLabel: (count: number) => string
): MergedGroup[] {
  const byKey = new Map<string, MergeInput[]>();
  rows.forEach((row) => {
    const key = `${row.type}|${row.currency}`;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  });

  return Array.from(byKey.entries()).map(([key, list]) => {
    const amount = roundToDecimals(list.reduce((sum, r) => sum + r.amount, 0), 2);
    const sourceCount = list.reduce((sum, r) => sum + r.sourceCount, 0);
    let description: string;
    if (list.length === 1) {
      description = list[0].description;
    } else {
      const joined = list.map((r) => r.description).join(' + ');
      description = joined.length <= 100 ? joined : mergedLabel(sourceCount).slice(0, 100);
    }
    const categories = new Set(list.map((r) => r.category || ''));
    return {
      type: list[0].type,
      currency: list[0].currency,
      amount,
      description,
      sourceCount,
      category: categories.size === 1 ? Array.from(categories)[0] : '',
      key
    };
  });
}

const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  parseResult,
  days,
  updateDay,
  selectedCurrencies,
  budgetYear,
  budgetMonth,
  onImported
}) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const language = i18nInstance.language === 'uk' ? 'uk' : 'en';

  const [includedRows, setIncludedRows] = useState<Set<number>>(new Set());
  const [rowCategories, setRowCategories] = useState<Record<number, string>>({});
  const [mergedDays, setMergedDays] = useState<Set<number>>(new Set());
  const [mergedExistingDays, setMergedExistingDays] = useState<Set<number>>(new Set());
  const [mergedGroupCategories, setMergedGroupCategories] = useState<Record<string, string>>({});
  const [showNameCategories, setShowNameCategories] = useState(true);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Рядки поточного місяця. Дублікати вже наявних транзакцій відсіюються;
  // однакові назви (тип/валюта) в межах дня автоматично об'єднуються в один рядок.
  const { monthRows, monthSourceTotal, duplicateCount } = useMemo(() => {
    if (!parseResult || !parseResult.ok) {
      return { monthRows: [] as DisplayRow[], monthSourceTotal: 0, duplicateCount: 0 };
    }
    const filtered = parseResult.transactions.filter(
      (tx) => tx.year === budgetYear && tx.month === budgetMonth
    );

    const existingInMonth: { day: number; type: 'income' | 'expense'; amount: number; currency: string; description: string }[] = [];
    days.forEach((day, index) => {
      const txs = Array.isArray(day?.transactions) ? day.transactions : [];
      txs.forEach((tx) => {
        existingInMonth.push({
          day: day.day ?? index + 1,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          description: tx.description
        });
      });
    });

    const { newTransactions, duplicateCount: skippedDuplicates } =
      filterExistingCsvTransactions(filtered, existingInMonth);

    const map = new Map<string, DisplayRow>();
    const order: string[] = [];
    newTransactions.forEach((tx) => {
      const key = `${tx.day}|${tx.type}|${tx.currency}|${tx.description.trim().toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.amount = roundToDecimals(existing.amount + tx.amount, 2);
        existing.sourceCount += 1;
      } else {
        map.set(key, {
          rowIndex: tx.rowIndex,
          date: tx.date,
          day: tx.day,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          description: tx.description,
          sourceCount: 1
        });
        order.push(key);
      }
    });
    return {
      monthRows: order.map((k) => map.get(k)!),
      monthSourceTotal: filtered.length,
      duplicateCount: skippedDuplicates
    };
  }, [parseResult, budgetYear, budgetMonth, days]);

  const autoMergedCount = monthSourceTotal - duplicateCount - monthRows.length;

  const otherMonthCount = useMemo(() => {
    if (!parseResult || !parseResult.ok) return 0;
    return parseResult.transactions.length - monthSourceTotal;
  }, [parseResult, monthSourceTotal]);

  // Скидання стану при кожному відкритті: за замовчуванням включені всі рядки
  // поточного місяця, без категорій, без об'єднань.
  useEffect(() => {
    if (!isOpen) return;
    setIncludedRows(new Set(monthRows.map((r) => r.rowIndex)));
    setRowCategories({});
    setMergedDays(new Set());
    setMergedExistingDays(new Set());
    setMergedGroupCategories({});
    setShowNameCategories(true);
    setShowAlertModal(false);
    setAlertMessage('');
  }, [isOpen, monthRows]);

  const dayGroups = useMemo(() => {
    const map = new Map<number, DisplayRow[]>();
    monthRows.forEach((row) => {
      const list = map.get(row.day) || [];
      list.push(row);
      map.set(row.day, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [monthRows]);

  /**
   * Однакові назви в різних днях: дозволяють призначити категорію одразу всім
   * таким рядкам, замість проклікування кожного дня окремо.
   */
  const nameGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        description: string;
        type: 'income' | 'expense';
        rowIndexes: number[];
        days: Set<number>;
        sourceCount: number;
      }
    >();
    monthRows.forEach((row) => {
      const key = `${row.type}|${row.description.trim().toLowerCase()}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          description: row.description,
          type: row.type,
          rowIndexes: [],
          days: new Set(),
          sourceCount: 0
        };
        map.set(key, group);
      }
      group.rowIndexes.push(row.rowIndex);
      group.days.add(row.day);
      group.sourceCount += row.sourceCount;
    });
    return Array.from(map.values())
      .filter((group) => group.rowIndexes.length > 1)
      .sort((a, b) => b.rowIndexes.length - a.rowIndexes.length);
  }, [monthRows]);

  /** Спільна категорія набору рядків (порожньо, якщо різні). */
  const getSharedCategory = (rowIndexes: number[]) => {
    const values = new Set(rowIndexes.map((index) => rowCategories[index] || ''));
    return values.size === 1 ? Array.from(values)[0] : '';
  };

  const applyCategoryToRows = (rowIndexes: number[], categoryId: string) => {
    setRowCategories((prev) => {
      const next = { ...prev };
      rowIndexes.forEach((index) => {
        if (categoryId) next[index] = categoryId;
        else delete next[index];
      });
      return next;
    });
  };

  const unknownCurrencies = useMemo(() => {
    const set = new Set<string>();
    monthRows.forEach((row) => {
      if (!selectedCurrencies.includes(row.currency)) set.add(row.currency);
    });
    return Array.from(set);
  }, [monthRows, selectedCurrencies]);

  const mergedLabel = (count: number) =>
    t('csvImport.mergedDescription', { count });

  const rowsToMergeInputs = (rows: DisplayRow[]): MergeInput[] =>
    rows.map((r) => ({
      type: r.type,
      currency: r.currency,
      amount: r.amount,
      description: r.description,
      sourceCount: r.sourceCount,
      category: rowCategories[r.rowIndex] || ''
    }));

  const existingToMergeInputs = (txs: Transaction[]): MergeInput[] =>
    txs.map((tx) => ({
      type: tx.type,
      currency: tx.currency,
      amount: tx.amount,
      description: tx.description,
      sourceCount: 1,
      category: tx.category || ''
    }));

  const getExistingTransactions = (day: number): Transaction[] => {
    const existing = days[day - 1];
    return Array.isArray(existing?.transactions) ? existing.transactions : [];
  };

  const getSelectedRowsForDay = (rows: DisplayRow[]) =>
    rows.filter((r) => includedRows.has(r.rowIndex));

  /** Фінальний список нових транзакцій для дня (з урахуванням об'єднання і категорій). */
  const buildFinalTransactionsForDay = (
    day: number,
    selectedRows: DisplayRow[]
  ): Transaction[] => {
    if (mergedDays.has(day) && selectedRows.length > 1) {
      const groups = buildMergedGroups(rowsToMergeInputs(selectedRows), mergedLabel);
      return groups.map((g) => {
        const categoryId = mergedGroupCategories[`new|${day}|${g.key}`] ?? g.category;
        return {
          id: generateTransactionId(),
          type: g.type,
          amount: g.amount,
          currency: g.currency,
          description: g.description.slice(0, 100),
          date: new Date(budgetYear, budgetMonth, day, 12, 0, 0),
          ...(categoryId ? { category: categoryId } : {})
        };
      });
    }
    return selectedRows.map((row) => {
      const categoryId = rowCategories[row.rowIndex] || '';
      return {
        id: generateTransactionId(),
        type: row.type,
        amount: row.amount,
        currency: row.currency,
        description: row.description,
        date: row.date,
        ...(categoryId ? { category: categoryId } : {})
      };
    });
  };

  /** Фінальний список існуючих транзакцій дня (об'єднаних, якщо увімкнено). */
  const buildFinalExistingForDay = (day: number): Transaction[] => {
    const existingTxs = getExistingTransactions(day);
    if (!mergedExistingDays.has(day) || existingTxs.length <= 1) return existingTxs;
    const groups = buildMergedGroups(existingToMergeInputs(existingTxs), mergedLabel);
    return groups.map((g) => {
      const categoryId = mergedGroupCategories[`ex|${day}|${g.key}`] ?? g.category;
      return {
        id: generateTransactionId(),
        type: g.type,
        amount: g.amount,
        currency: g.currency,
        description: g.description.slice(0, 100),
        date: new Date(budgetYear, budgetMonth, day, 12, 0, 0),
        ...(categoryId ? { category: categoryId } : {})
      };
    });
  };

  const getExistingFinalCount = (day: number) => {
    const existingTxs = getExistingTransactions(day);
    if (mergedExistingDays.has(day) && existingTxs.length > 1) {
      return buildMergedGroups(existingToMergeInputs(existingTxs), mergedLabel).length;
    }
    return existingTxs.length;
  };

  const getFinalNewCount = (day: number, rows: DisplayRow[]) => {
    const selected = getSelectedRowsForDay(rows);
    if (selected.length === 0) return 0;
    if (mergedDays.has(day) && selected.length > 1) {
      return buildMergedGroups(rowsToMergeInputs(selected), mergedLabel).length;
    }
    return selected.length;
  };

  const totalSelected = useMemo(
    () => monthRows.filter((r) => includedRows.has(r.rowIndex)).length,
    [monthRows, includedRows]
  );

  /** Скільки транзакцій реально буде створено (з урахуванням об'єднань). */
  const finalTotalCount = useMemo(() => {
    return dayGroups.reduce((sum, [day, rows]) => sum + getFinalNewCount(day, rows), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayGroups, includedRows, mergedDays]);

  /** Транзакції, які вже є в місяці, з урахуванням об'єднання існуючих днів. */
  const existingMonthCount = useMemo(() => {
    let total = countTransactionsInDays(days);
    mergedExistingDays.forEach((day) => {
      const existingTxs = getExistingTransactions(day);
      if (existingTxs.length > 1) total -= existingTxs.length - getExistingFinalCount(day);
    });
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, mergedExistingDays]);

  const projectedMonthCount = existingMonthCount + finalTotalCount;
  const isOverMonthLimit = projectedMonthCount > MAX_TRANSACTIONS_PER_MONTH;

  const toggleRow = (rowIndex: number) => {
    setIncludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleMergeDay = (day: number) => {
    setMergedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const toggleMergeExistingDay = (day: number) => {
    setMergedExistingDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  /**
   * Об'єднує нові транзакції кожного дня, а також існуючі — це максимально
   * зменшує кількість записів, коли місяць не вміщається в ліміт.
   */
  const mergeAllDays = () => {
    const nextMerged = new Set(mergedDays);
    const nextMergedExisting = new Set(mergedExistingDays);

    dayGroups.forEach(([day, rows]) => {
      if (getSelectedRowsForDay(rows).length > 1) nextMerged.add(day);
      if (getExistingTransactions(day).length > 1) nextMergedExisting.add(day);
    });

    setMergedDays(nextMerged);
    setMergedExistingDays(nextMergedExisting);
  };

  const handleImport = () => {
    if (isOverMonthLimit) {
      setAlertMessage(t('csvImport.overMonthLimitError', { max: MAX_TRANSACTIONS_PER_MONTH }));
      setShowAlertModal(true);
      return;
    }

    let importedCount = 0;
    dayGroups.forEach(([day, rows]) => {
      const selected = getSelectedRowsForDay(rows);
      const existingTxs = getExistingTransactions(day);
      const mergeExisting = mergedExistingDays.has(day) && existingTxs.length > 1;
      if (selected.length === 0 && !mergeExisting) return;

      const newTransactions = buildFinalTransactionsForDay(day, selected);
      const finalExisting = mergeExisting ? buildFinalExistingForDay(day) : [...existingTxs];
      updateDay(day - 1, 'transactions', [...finalExisting, ...newTransactions]);
      importedCount += newTransactions.length;
    });

    onImported(importedCount);
    onClose();
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const monthLabel = capitalizeFirstLetter(
    getMonthYearLabel(i18nInstance.language || 'en', budgetYear, budgetMonth)
  );

  const renderCategorySelect = (
    value: string,
    onChange: (categoryId: string) => void
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs px-1.5 py-1 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 max-w-[150px]"
      title={t('csvImport.categoryTitle')}
    >
      <option value="">{t('csvImport.noCategory')}</option>
      {TRANSACTION_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.emoji} {language === 'uk' ? c.name.uk : c.name.en}
        </option>
      ))}
    </select>
  );

  const renderMergedGroupRow = (g: MergedGroup, categoryKey: string) => (
    <div
      key={g.key}
      className="flex items-center gap-2 text-xs sm:text-sm bg-white border border-indigo-200 rounded-lg px-2 py-1.5"
    >
      <span>{g.type === 'income' ? '✅' : '❌'}</span>
      <span className="font-bold whitespace-nowrap">
        {g.amount} {g.currency}
      </span>
      <span className="flex-1 truncate text-gray-700" title={g.description}>
        {g.description}
      </span>
      <span className="text-[10px] text-gray-500 whitespace-nowrap">×{g.sourceCount}</span>
      {renderCategorySelect(
        mergedGroupCategories[categoryKey] ?? g.category,
        (categoryId) =>
          setMergedGroupCategories((prev) => ({
            ...prev,
            [categoryKey]: categoryId
          }))
      )}
    </div>
  );

  const renderContent = () => {
    if (!parseResult) return null;

    if (!parseResult.ok) {
      return (
        <div className="p-4 bg-rose-50 border-2 border-rose-200 rounded-xl text-sm text-rose-800">
          {parseResult.error === 'noColumns'
            ? t('csvImport.errorNoColumns')
            : t('csvImport.errorEmpty')}
        </div>
      );
    }

    return (
      <>
        {/* Підсумок розпізнавання */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-gray-700 space-y-1">
          <p>
            <strong>{t('csvImport.fileLabel')}</strong> {fileName}
          </p>
          <p>
            {t('csvImport.detectedSummary', {
              count: monthSourceTotal,
              month: monthLabel
            })}
          </p>
          {duplicateCount > 0 && (
            <p className="text-emerald-700">
              {t('csvImport.duplicatesSkippedNote', { count: duplicateCount })}
            </p>
          )}
          {autoMergedCount > 0 && (
            <p className="text-indigo-700">
              {t('csvImport.autoMergedNote', { count: autoMergedCount })}
            </p>
          )}
          {otherMonthCount > 0 && (
            <p className="text-amber-700">
              {t('csvImport.otherMonthNote', { count: otherMonthCount, month: monthLabel })}
            </p>
          )}
          {parseResult.skippedRows > 0 && (
            <p className="text-gray-500">
              {t('csvImport.skippedRows', { count: parseResult.skippedRows })}
            </p>
          )}
          {unknownCurrencies.length > 0 && (
            <p className="text-amber-700">
              {t('csvImport.unknownCurrencyWarning', {
                currencies: unknownCurrencies.join(', ')
              })}
            </p>
          )}
        </div>

        {monthRows.length === 0 ? (
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl text-sm text-amber-800">
            {duplicateCount > 0 && monthSourceTotal > 0
              ? t('csvImport.allDuplicates', { month: monthLabel, count: duplicateCount })
              : t('csvImport.nothingForMonth', { month: monthLabel })}
          </div>
        ) : (
          <>
            {/* Глобальні категорії: одна назва — одна категорія для всіх днів */}
            <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50">
              <button
                type="button"
                onClick={() => setShowNameCategories((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="text-xs sm:text-sm font-bold text-indigo-800">
                  🏷️ {t('csvImport.nameCategoriesTitle')}
                </span>
                <span className="text-indigo-600 text-xs font-bold">
                  {showNameCategories ? '▲' : '▼'}
                </span>
              </button>

              {showNameCategories && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[11px] sm:text-xs text-indigo-700">
                    {t('csvImport.nameCategoriesHint')}
                  </p>

                  <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-2 py-1.5">
                    <span className="flex-1 text-xs sm:text-sm font-semibold text-gray-700">
                      {t('csvImport.applyToAllRows')}
                    </span>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                      ×{monthRows.length}
                    </span>
                    {renderCategorySelect(
                      getSharedCategory(monthRows.map((row) => row.rowIndex)),
                      (categoryId) =>
                        applyCategoryToRows(
                          monthRows.map((row) => row.rowIndex),
                          categoryId
                        )
                    )}
                  </div>

                  {nameGroups.length === 0 ? (
                    <p className="text-[11px] sm:text-xs text-gray-500">
                      {t('csvImport.noRepeatedNames')}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {nameGroups.map((group) => (
                        <div
                          key={group.key}
                          className="flex items-center gap-2 text-xs sm:text-sm bg-white border border-indigo-200 rounded-lg px-2 py-1.5"
                        >
                          <span>{group.type === 'income' ? '✅' : '❌'}</span>
                          <span
                            className="flex-1 truncate text-gray-700"
                            title={group.description}
                          >
                            {group.description}
                          </span>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">
                            {t('csvImport.nameGroupMeta', {
                              count: group.sourceCount,
                              days: group.days.size
                            })}
                          </span>
                          {renderCategorySelect(
                            getSharedCategory(group.rowIndexes),
                            (categoryId) => applyCategoryToRows(group.rowIndexes, categoryId)
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              className={`mb-4 p-3 rounded-xl border-2 ${
                isOverMonthLimit
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <p
                className={`text-xs sm:text-sm mb-2 ${
                  isOverMonthLimit ? 'text-amber-800' : 'text-gray-600'
                }`}
              >
                {t('csvImport.monthCounter', {
                  total: projectedMonthCount,
                  max: MAX_TRANSACTIONS_PER_MONTH
                })}
                {isOverMonthLimit && ` — ${t('csvImport.overMonthLimitHint')}`}
              </p>
              {isOverMonthLimit && (
                <button
                  type="button"
                  onClick={mergeAllDays}
                  className="px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                >
                  🔗 {t('csvImport.mergeAllDays')}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {dayGroups.map(([day, rows]) => {
                const selected = getSelectedRowsForDay(rows);
                const existingTxs = getExistingTransactions(day);
                const isMerged = mergedDays.has(day) && selected.length > 1;
                const isExistingMerged =
                  mergedExistingDays.has(day) && existingTxs.length > 1;
                const totalCount = getExistingFinalCount(day) + getFinalNewCount(day, rows);
                const mergedGroups = isMerged
                  ? buildMergedGroups(rowsToMergeInputs(selected), mergedLabel)
                  : [];
                const mergedExistingGroups = isExistingMerged
                  ? buildMergedGroups(existingToMergeInputs(existingTxs), mergedLabel)
                  : [];

                return (
                  <div key={day} className="rounded-xl border-2 p-3 border-gray-200 bg-gray-50">
                    {/* Заголовок дня */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-bold text-gray-800">
                        📅 {t('csvImport.dayHeader', { day })}
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          {t('csvImport.dayCounter', { total: totalCount })}
                        </span>
                      </div>
                      {selected.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleMergeDay(day)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                            isMerged
                              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                              : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          }`}
                        >
                          {isMerged
                            ? `✂️ ${t('csvImport.unmerge')}`
                            : `🔗 ${t('csvImport.mergeDay', { count: selected.length })}`}
                        </button>
                      )}
                    </div>

                    {/* Існуючі транзакції дня */}
                    {existingTxs.length > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            {t('csvImport.existingLabel', { count: existingTxs.length })}
                          </span>
                          {existingTxs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => toggleMergeExistingDay(day)}
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-colors ${
                                isExistingMerged
                                  ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                            >
                              {isExistingMerged
                                ? `✂️ ${t('csvImport.unmergeExisting')}`
                                : `🔗 ${t('csvImport.mergeExisting', { count: existingTxs.length })}`}
                            </button>
                          )}
                        </div>
                        {isExistingMerged ? (
                          <div className="space-y-1.5">
                            {mergedExistingGroups.map((g) =>
                              renderMergedGroupRow(g, `ex|${day}|${g.key}`)
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {existingTxs.map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center gap-2 text-[11px] sm:text-xs rounded-lg px-2 py-1 bg-gray-100 border border-gray-200 text-gray-500"
                              >
                                <span>{tx.type === 'income' ? '✅' : '❌'}</span>
                                <span className="font-semibold whitespace-nowrap">
                                  {tx.amount} {tx.currency}
                                </span>
                                <span className="flex-1 truncate" title={tx.description}>
                                  {tx.description}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Нові транзакції з файлу */}
                    {existingTxs.length > 0 && (
                      <div className="mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          {t('csvImport.newLabel')}
                        </span>
                      </div>
                    )}
                    {isMerged ? (
                      <div className="space-y-1.5">
                        {mergedGroups.map((g) =>
                          renderMergedGroupRow(g, `new|${day}|${g.key}`)
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {rows.map((row) => {
                          const isIncluded = includedRows.has(row.rowIndex);
                          return (
                            <div
                              key={row.rowIndex}
                              className={`flex items-center gap-2 text-xs sm:text-sm rounded-lg px-2 py-1.5 border ${
                                isIncluded
                                  ? 'bg-white border-gray-200'
                                  : 'bg-gray-100 border-gray-200 opacity-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => toggleRow(row.rowIndex)}
                                className="w-4 h-4 accent-indigo-600 shrink-0"
                              />
                              <span>{row.type === 'income' ? '✅' : '❌'}</span>
                              <span className="font-bold whitespace-nowrap">
                                {row.amount} {row.currency}
                              </span>
                              <span
                                className="flex-1 truncate text-gray-700"
                                title={row.description}
                              >
                                {row.description}
                              </span>
                              {row.sourceCount > 1 && (
                                <span
                                  className="text-[10px] text-indigo-500 font-semibold whitespace-nowrap"
                                  title={t('csvImport.autoMergedRowTitle', {
                                    count: row.sourceCount
                                  })}
                                >
                                  ×{row.sourceCount}
                                </span>
                              )}
                              {isIncluded &&
                                renderCategorySelect(
                                  rowCategories[row.rowIndex] || '',
                                  (categoryId) =>
                                    setRowCategories((prev) => ({
                                      ...prev,
                                      [row.rowIndex]: categoryId
                                    }))
                                )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  };

  const canImport =
    parseResult?.ok === true && totalSelected > 0;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm p-0 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 border-0 sm:border-2 border-gray-200 sm:max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">
            📄 {t('csvImport.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1">{renderContent()}</div>

        <div className="flex gap-2 pt-4 mt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            {t('transaction.cancel')}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors ${
              canImport
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {t('csvImport.importButton', { count: finalTotalCount })}
          </button>
        </div>
      </div>

      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        message={alertMessage}
        type="error"
        buttonText={translate('common.ok')}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CsvImportModal;
