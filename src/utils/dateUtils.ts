export const MELBOURNE_TZ = 'Australia/Melbourne';

/**
 * Returns today's date formatted as YYYY-MM-DD in Melbourne time.
 */
export function getLocalDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns year and month index (0-11) in Melbourne time.
 */
export function getLocalYearMonth(d: Date = new Date()): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(d).split('-');
  return {
    year: parseInt(parts[0], 10),
    monthIndex: parseInt(parts[1], 10) - 1,
  };
}

/**
 * Formats any date string (YYYY-MM-DD or DD/MM/YYYY) into Australian DD/MM/YYYY.
 */
export function formatAustralianDate(dateStr?: string): string {
  if (!dateStr) return '';
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  }
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    let y = dmyMatch[3];
    if (y.length === 2) {
      const numY = parseInt(y, 10);
      y = numY > 30 ? `19${y}` : `20${y}`;
    }
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${y}`;
  }
  return dateStr;
}

/**
 * Formats timestamp into 12-hour Melbourne time (e.g. 9:40 pm).
 */
export function formatMelbourneTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: MELBOURNE_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '';
  }
}
