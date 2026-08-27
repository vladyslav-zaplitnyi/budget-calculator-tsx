import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../utils/calculations';
import { getCurrencySymbol } from '../utils/currencies';
import { getCategoryLabel } from '../utils/categories';
import { CATEGORY_CHART_COLORS } from '../utils/pdfReportCharts';
import {
  isUncategorizedPdfCategory,
  type PdfReportData,
  type PdfReportInsight
} from '../utils/budgetPdfReportData';
import { PdfCategoryDonut, PdfIncomeExpenseChart } from './PdfReportChartCanvases';

export const PDF_REPORT_PAGE_ATTR = 'data-pdf-report-page';

const PDF_FONT = "'Segoe UI', 'Noto Sans', Arial, sans-serif";

const PAGE: React.CSSProperties = {
  width: 794,
  height: 1123,
  background: '#ffffff',
  color: '#0f172a',
  fontFamily: PDF_FONT,
  lineHeight: 1.45,
  boxSizing: 'border-box',
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column'
};

interface PdfReportPagesProps {
  data: PdfReportData;
}

const money = (value: number, symbol: string): string =>
  `${symbol}${formatNumber(value, 2)}`;

const signedMoney = (value: number, symbol: string): string => {
  const abs = money(Math.abs(value), symbol);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
};

const categoryName = (
  categoryId: string,
  language: string,
  uncategorized: string
): string => {
  if (isUncategorizedPdfCategory(categoryId)) return uncategorized;
  return getCategoryLabel(categoryId, language === 'uk' ? 'uk' : 'en') || categoryId;
};

const PdfReportPages: React.FC<PdfReportPagesProps> = ({ data }) => {
  const { t, i18n } = useTranslation();
  const symbol = getCurrencySymbol(data.displayCurrency);
  const language = i18n.language || data.locale;
  const uncategorized = t('pdfExport.uncategorized');
  const monthLabelByKey = useMemo(
    () => new Map(data.months.map((month) => [month.key, month.label])),
    [data.months]
  );

  const generatedLabel = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(data.generatedAt);

  const periodLabel = useMemo(() => {
    if (data.months.length === 0) return t('pdfExport.noData');
    if (data.months.length === 1) return data.months[0].label;
    if (data.periodContiguous) {
      return `${data.months[0].label} – ${data.months[data.months.length - 1].label}`;
    }
    if (data.months.length <= 5) {
      return data.months.map((month) => month.shortLabel).join(', ');
    }
    return t('pdfExport.periodMixed', {
      first: data.months[0].label,
      last: data.months[data.months.length - 1].label,
      count: data.months.length
    });
  }, [data.months, data.periodContiguous, t]);

  const formatInsight = (insight: PdfReportInsight): string => {
    switch (insight.id) {
      case 'netPositive':
        return t('pdfExport.insightNetPositive', { amount: money(insight.amount, symbol) });
      case 'netNegative':
        return t('pdfExport.insightNetNegative', { amount: money(insight.amount, symbol) });
      case 'bestMonth':
        return t('pdfExport.insightBestMonth', {
          month: monthLabelByKey.get(insight.monthKey) || insight.monthKey,
          amount: signedMoney(insight.amount, symbol)
        });
      case 'highestSpendMonth':
        return t('pdfExport.insightHighestSpend', {
          month: monthLabelByKey.get(insight.monthKey) || insight.monthKey,
          amount: money(insight.amount, symbol)
        });
      case 'topCategory':
        return t('pdfExport.insightTopCategory', {
          category: categoryName(insight.categoryId, language, uncategorized),
          percent: insight.percentage.toFixed(1)
        });
      case 'overspentMonths':
        return t('pdfExport.insightOverspent', { count: insight.count });
      case 'savingsRate':
        return t('pdfExport.insightSavings', { percent: insight.percent.toFixed(1) });
      case 'spendingRatio':
        return t('pdfExport.insightSpendingRatio', { percent: insight.percent.toFixed(1) });
      case 'peakVsAverage':
        return t('pdfExport.insightPeakVsAverage', { percent: insight.percent.toFixed(0) });
      default:
        return '';
    }
  };

  const chartMonths = data.months.map((month) => ({
    label: month.shortLabel,
    income: month.income,
    expense: month.expense
  }));

  const donutSlices = data.categories.slice(0, 8).map((category, index) => ({
    label: categoryName(category.id, language, uncategorized),
    value: category.totalAmount,
    color: CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]
  }));

  const highlightInsights = data.insights.slice(0, 4);
  const remainingInsights = data.insights.slice(4);
  const maxTopExpense = data.topExpenses[0]?.convertedAmount || 1;

  const formatAxis = (value: number) => formatNumber(value, value >= 100 ? 0 : 2);

  const footer = (page: number, total: number) => (
    <div
      style={{
        marginTop: 'auto',
        padding: '10px 36px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        color: '#64748b',
        fontSize: 11,
        borderTop: '1px solid #e2e8f0'
      }}
    >
      <span>{t('pdfExport.footer')}</span>
      <span>{t('pdfExport.page', { current: page, total })}</span>
    </div>
  );

  return (
    <>
      <div data-pdf-report-page="1" style={PAGE}>
        <div
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 55%, #7c3aed 100%)',
            color: '#ffffff',
            padding: '28px 36px 24px'
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, opacity: 0.85 }}>
            {t('pdfExport.kicker')}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 16,
              marginTop: 6
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>
              {t('pdfExport.reportTitle')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'right', maxWidth: 280 }}>
              {data.budgetName}
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.92 }}>
            {periodLabel}
            {' · '}
            {t('pdfExport.currency', { currency: data.displayCurrency })}
            {' · '}
            {t('pdfExport.generated')}: {generatedLabel}
          </div>
        </div>

        <div style={{ padding: '20px 36px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              {
                label: t('pdfExport.income'),
                value: money(data.totals.income, symbol),
                color: '#059669',
                bg: '#ecfdf5'
              },
              {
                label: t('pdfExport.expense'),
                value: money(data.totals.expense, symbol),
                color: '#e11d48',
                bg: '#fff1f2'
              },
              {
                label: t('pdfExport.net'),
                value: signedMoney(data.totals.net, symbol),
                color: data.totals.net >= 0 ? '#0f766e' : '#be123c',
                bg: data.totals.net >= 0 ? '#f0fdfa' : '#fff1f2'
              },
              {
                label: t('pdfExport.savingsRate'),
                value: `${data.totals.savingsRate.toFixed(1)}%`,
                color: '#7c3aed',
                bg: '#f5f3ff'
              }
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  flex: 1,
                  background: card.bg,
                  borderRadius: 14,
                  padding: '12px 14px',
                  borderLeft: `4px solid ${card.color}`
                }}
              >
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: card.color, marginTop: 4 }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '12px 14px 8px',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)'
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {t('pdfExport.chartTitle')}
            </div>
            <PdfIncomeExpenseChart
              months={chartMonths}
              width={710}
              height={268}
              incomeLabel={t('pdfExport.legendIncome')}
              expenseLabel={t('pdfExport.legendExpense')}
              formatValue={formatAxis}
              emptyLabel={t('pdfExport.noData')}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              {
                label: t('pdfExport.openingBalance'),
                value: money(data.totals.startBalance, symbol)
              },
              {
                label: t('pdfExport.closingBalance'),
                value: money(data.totals.endBalance, symbol)
              },
              {
                label: t('pdfExport.avgMonthlyExpense'),
                value: money(data.totals.avgMonthlyExpense, symbol)
              },
              {
                label: t('pdfExport.transactions'),
                value: String(data.totals.transactionCount)
              }
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  flex: 1,
                  background: '#f8fafc',
                  borderRadius: 12,
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>{item.value}</div>
              </div>
            ))}
          </div>

          {highlightInsights.length > 0 && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {highlightInsights.map((insight) => (
                <div
                  key={insight.id}
                  style={{
                    background: '#eef2ff',
                    borderRadius: 12,
                    padding: '10px 12px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: '#312e81',
                    fontWeight: 600
                  }}
                >
                  {formatInsight(insight)}
                </div>
              ))}
            </div>
          )}
        </div>
        {footer(1, 2)}
      </div>

      <div data-pdf-report-page="2" style={PAGE}>
        <div
          style={{
            height: 10,
            background: 'linear-gradient(90deg, #4f46e5 0%, #2563eb 55%, #7c3aed 100%)'
          }}
        />
        <div style={{ padding: '22px 36px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            {t('pdfExport.monthTable')}
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 11,
              tableLayout: 'fixed'
            }}
          >
            <thead>
              <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                {[
                  t('pdfExport.month'),
                  t('pdfExport.income'),
                  t('pdfExport.expense'),
                  t('pdfExport.net'),
                  t('pdfExport.endBalance')
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: heading === t('pdfExport.month') ? 'left' : 'right',
                      padding: '9px 10px',
                      fontWeight: 700,
                      lineHeight: 1.45
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.months.map((month, index) => {
                const pad = data.months.length > 8 ? '6px 8px' : '8px 10px';
                return (
                <tr key={month.key} style={{ background: index % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                  <td style={{ padding: pad, fontWeight: 700, lineHeight: 1.45 }}>{month.label}</td>
                  <td style={{ padding: pad, textAlign: 'right', color: '#059669', lineHeight: 1.45 }}>
                    {money(month.income, symbol)}
                  </td>
                  <td style={{ padding: pad, textAlign: 'right', color: '#e11d48', lineHeight: 1.45 }}>
                    {money(month.expense, symbol)}
                  </td>
                  <td
                    style={{
                      padding: pad,
                      textAlign: 'right',
                      color: month.net >= 0 ? '#0f766e' : '#be123c',
                      fontWeight: 700,
                      lineHeight: 1.45
                    }}
                  >
                    {signedMoney(month.net, symbol)}
                  </td>
                  <td style={{ padding: pad, textAlign: 'right', lineHeight: 1.45 }}>
                    {money(month.endBalance, symbol)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 18, marginTop: 22 }}>
            <div style={{ width: 230, flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                {t('pdfExport.categories')}
              </div>
              <PdfCategoryDonut
                slices={donutSlices}
                width={220}
                height={220}
                centerLabel={t('pdfExport.expense')}
                centerValue={money(data.totals.expense, symbol)}
                emptyLabel={t('pdfExport.noExpenses')}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 28 }}>
              {data.categories.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 13 }}>{t('pdfExport.noExpenses')}</div>
              ) : (
                data.categories.slice(0, 8).map((category, index) => (
                  <div
                    key={category.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 10
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 99,
                        background: CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length],
                        flexShrink: 0,
                        marginTop: 5
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 8,
                          fontSize: 12,
                          lineHeight: 1.45
                        }}
                      >
                        <span style={{ fontWeight: 700, lineHeight: 1.45, paddingBottom: 2 }}>
                          {categoryName(category.id, language, uncategorized)}
                        </span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.45, flexShrink: 0 }}>
                          {money(category.totalAmount, symbol)}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          height: 6,
                          borderRadius: 99,
                          background: '#e2e8f0',
                          overflow: 'hidden'
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(category.percentage, 100)}%`,
                            height: '100%',
                            background: CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ width: 42, textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                      {category.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
              {t('pdfExport.topExpenses')}
            </div>
            {data.topExpenses.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>{t('pdfExport.noExpenses')}</div>
            ) : (
              data.topExpenses.slice(0, data.months.length > 9 ? 5 : 6).map((expense, index) => (
                <div
                  key={`${expense.monthKey}-${expense.day}-${index}`}
                  style={{
                    position: 'relative',
                    marginBottom: 8,
                    borderRadius: 10,
                    border: '1px solid #ffe4e6'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${(expense.convertedAmount / maxTopExpense) * 100}%`,
                      background: '#fff1f2',
                      borderRadius: 10
                    }}
                  />
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '10px 12px',
                      fontSize: 12,
                      lineHeight: 1.45
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, lineHeight: 1.45, paddingBottom: 2 }}>
                        {index + 1}. {expense.description}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.45, marginTop: 2 }}>
                        {expense.monthLabel}, {t('pdfExport.day', { day: expense.day })}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#e11d48', whiteSpace: 'nowrap', lineHeight: 1.45, flexShrink: 0 }}>
                      {money(expense.convertedAmount, symbol)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {remainingInsights.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
              {remainingInsights.map((insight) => (
                <div key={insight.id} style={{ marginBottom: 4 }}>
                  • {formatInsight(insight)}
                </div>
              ))}
            </div>
          )}
        </div>
        {footer(2, 2)}
      </div>
    </>
  );
};

export default React.memo(PdfReportPages);
