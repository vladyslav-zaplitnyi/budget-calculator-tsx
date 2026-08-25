import { Day, ExchangeRates } from '../types';
import { calculateDayAmountsFromTransactions, convertCurrency } from './calculations';
import { roundToDecimals } from './rounding';

export const MAX_CRITICAL_RANGES = 5;

export interface CriticalDayRange {
  startDay: number;
  endDay: number;
  balance: number;
}

export interface DatedCriticalDayRange extends CriticalDayRange {
  key: string;
  year: number;
  month: number;
}

export interface MonthDailyBalances {
  key: string;
  year: number;
  month: number;
  dailyBalances: number[];
}

export function formatDayRange(startDay: number, endDay: number): string {
  return startDay === endDay ? String(startDay) : `${startDay}-${endDay}`;
}

/** Cumulative projected balance in display currency after each calendar day. */
export function computeDailyRunningBalances(
  days: Day[] | undefined,
  startBalances: Record<string, number | null> | undefined,
  daysInMonth: number,
  selectedCurrencies: string[],
  displayCurrency: string,
  exchangeRates: ExchangeRates
): number[] {
  const visibleDays = (days || []).slice(0, daysInMonth);
  const balances: number[] = [];

  let running = 0;
  for (const code of selectedCurrencies) {
    const bal = parseFloat(String(startBalances?.[code])) || 0;
    running += convertCurrency(bal, code, displayCurrency, exchangeRates);
  }

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
    balances.push(roundToDecimals(running, 2));
  }

  return balances;
}

export function findLowestBalanceRanges(
  dailyBalances: number[],
  maxRanges: number = MAX_CRITICAL_RANGES
): CriticalDayRange[] {
  if (dailyBalances.length === 0) return [];

  const minBalance = Math.min(...dailyBalances);
  const ranges: CriticalDayRange[] = [];

  dailyBalances.forEach((balance, index) => {
    if (balance !== minBalance) return;
    const day = index + 1;
    const last = ranges[ranges.length - 1];
    if (last && last.endDay === day - 1 && last.balance === balance) {
      last.endDay = day;
      return;
    }
    ranges.push({ startDay: day, endDay: day, balance });
  });

  return ranges.slice(0, maxRanges);
}

export function findLowestBalanceRangesAcrossMonths(
  months: MonthDailyBalances[],
  maxRanges: number = MAX_CRITICAL_RANGES
): DatedCriticalDayRange[] {
  const allBalances = months.flatMap((month) => month.dailyBalances);
  if (allBalances.length === 0) return [];

  const minBalance = Math.min(...allBalances);
  const ranges: DatedCriticalDayRange[] = [];

  months.forEach((month) => {
    month.dailyBalances.forEach((balance, index) => {
      if (balance !== minBalance) return;
      const day = index + 1;
      const last = ranges[ranges.length - 1];
      if (
        last &&
        last.key === month.key &&
        last.endDay === day - 1 &&
        last.balance === balance
      ) {
        last.endDay = day;
        return;
      }
      ranges.push({
        key: month.key,
        year: month.year,
        month: month.month,
        startDay: day,
        endDay: day,
        balance
      });
    });
  });

  return ranges.slice(0, maxRanges);
}
