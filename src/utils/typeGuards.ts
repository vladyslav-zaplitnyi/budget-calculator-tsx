import { ExchangeRates } from '../types';

/**
 * Type guard to check if an exchange rate value is a pair object with buy/sell
 */
export function isExchangeRatePair(
  value: number | { buy: number; sell: number } | undefined
): value is { buy: number; sell: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buy' in value &&
    'sell' in value &&
    typeof value.buy === 'number' &&
    typeof value.sell === 'number'
  );
}

/**
 * Type guard to check if an exchange rate value is a number
 */
export function isExchangeRateNumber(
  value: number | { buy: number; sell: number } | undefined
): value is number {
  return typeof value === 'number';
}

/**
 * Get the buy rate from an exchange rate value (supports both old and new structure)
 */
export function getBuyRate(
  value: number | { buy: number; sell: number } | undefined,
  fallback: number = 1
): number {
  if (isExchangeRatePair(value)) {
    return value.buy;
  }
  if (isExchangeRateNumber(value)) {
    return value;
  }
  return fallback;
}

/**
 * Get the sell rate from an exchange rate value (supports both old and new structure)
 */
export function getSellRate(
  value: number | { buy: number; sell: number } | undefined,
  fallback: number = 1
): number {
  if (isExchangeRatePair(value)) {
    return value.sell;
  }
  if (isExchangeRateNumber(value)) {
    return value;
  }
  return fallback;
}

/**
 * Type guard to check if a value is a function
 */
export function isFunction<T extends (...args: unknown[]) => unknown>(
  value: unknown
): value is T {
  return typeof value === 'function';
}

/**
 * Check if exchange rates use the new pair structure (UAH_USD format)
 */
export function hasPairStructure(exchangeRates: ExchangeRates): boolean {
  return Object.keys(exchangeRates).some(
    (key) =>
      key.includes('_') &&
      isExchangeRatePair(exchangeRates[key])
  );
}

