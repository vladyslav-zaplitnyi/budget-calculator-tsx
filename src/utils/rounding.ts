/**
 * Round a number to a fixed amount of decimal places.
 * Returns 0 for non-finite inputs.
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  if (!isFinite(value) || isNaN(value)) return 0;
  return Number(value.toFixed(decimals));
}


