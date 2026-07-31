import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_TRANSACTIONS_PER_MONTH,
  shouldWarnAboutMonthUsage
} from '../utils/transactionLimits';

interface MonthTransactionCounterProps {
  count: number;
  className?: string;
}

/**
 * Warns that the active month is running out of transaction budget. Stays hidden
 * until the month is nearly full so the daily view is not cluttered.
 */
const MonthTransactionCounter: React.FC<MonthTransactionCounterProps> = ({
  count,
  className = ''
}) => {
  const { t } = useTranslation();

  if (!shouldWarnAboutMonthUsage(count)) return null;

  const isFull = count >= MAX_TRANSACTIONS_PER_MONTH;

  return (
    <div
      role="status"
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
        isFull
          ? 'bg-rose-50 border-rose-300 text-rose-800'
          : 'bg-amber-50 border-amber-300 text-amber-800'
      } ${className}`}
    >
      <span className="tabular-nums">
        {isFull ? '🚫' : '⚠️'}{' '}
        {t('transactionLimit.counter', { count, max: MAX_TRANSACTIONS_PER_MONTH })}
      </span>
      <span className="font-normal">
        {isFull ? t('transactionLimit.counterFullHint') : t('transactionLimit.counterHint')}
      </span>
    </div>
  );
};

export default React.memo(MonthTransactionCounter);
