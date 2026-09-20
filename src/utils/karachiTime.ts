/**
 * Timezone utilities for Nowshera Family Clinic (Asia/Karachi, UTC+5).
 * All appointments use slot_start and slot_end (ISO timestamps).
 * Date filtering and display MUST adhere to Asia/Karachi time zone.
 */

export const CLINIC_TIMEZONE = 'Asia/Karachi';

/**
 * Formats an ISO timestamp or Date into YYYY-MM-DD in Asia/Karachi time zone.
 */
export function getKarachiDate(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return '';
    // Use Intl with Asia/Karachi
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLINIC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d); // Returns 'YYYY-MM-DD'
  } catch (e) {
    console.error('Error formatting Karachi date:', e);
    return '';
  }
}

/**
 * Returns today's date in YYYY-MM-DD in Asia/Karachi time zone.
 */
export function getTodayKarachiDate(): string {
  return getKarachiDate(new Date());
}

/**
 * Formats an ISO timestamp into a human-friendly time string (e.g. "09:30 AM") in Asia/Karachi.
 */
export function formatKarachiTime(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CLINIC_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch (e) {
    return '';
  }
}

/**
 * Formats a slot range (e.g. "09:30 AM - 10:00 AM") in Asia/Karachi.
 */
export function formatKarachiSlotRange(startIso: string, endIso: string): string {
  const start = formatKarachiTime(startIso);
  const end = formatKarachiTime(endIso);
  if (!start && !end) return '';
  if (!end) return start;
  return `${start} - ${end}`;
}

/**
 * Formats an ISO timestamp into a friendly date string (e.g. "Monday, Sep 22, 2026") in Asia/Karachi.
 */
export function formatKarachiDate(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CLINIC_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch (e) {
    return '';
  }
}

/**
 * Checks if slot_start is more than 2 hours away from now.
 * Used for client-side hint/check (enforced server-side in RPCs).
 */
export function isMoreThanTwoHoursAway(slotStartIso: string): boolean {
  try {
    const slotTime = new Date(slotStartIso).getTime();
    const now = Date.now();
    const diffMs = slotTime - now;
    return diffMs > 2 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Checks if slot_start is in the future.
 */
export function isFutureSlot(slotStartIso: string): boolean {
  try {
    return new Date(slotStartIso).getTime() > Date.now();
  } catch {
    return false;
  }
}
