/**
 * Local date utilities to prevent UTC/server date shifting.
 * Formats dates in the user's local timezone (e.g. Melbourne/Australia) rather than UTC.
 */

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns year and month index (0-11) in local time.
 */
export function getLocalYearMonth(d: Date = new Date()): { year: number; monthIndex: number } {
  return {
    year: d.getFullYear(),
    monthIndex: d.getMonth(),
  };
}
