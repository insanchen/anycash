/**
 * Transaction date handling.
 *
 * Each transaction stores a real instant (`timestamptz`), but the product runs on one business
 * timezone (Asia/Jakarta). A bare `YYYY-MM-DD` has no time, so:
 *   - a date-only value for "today" records the current moment (the user means "just happened");
 *   - a date-only value for another day becomes midnight on that day in the business timezone;
 *   - a local date-time with no zone is read in the business timezone;
 *   - a value with a zone (or Z) is already an instant and is kept as-is.
 * Callers that update an existing row pass `preserve`, so saving the same day again never
 * rewrites the recorded time-of-day.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

export type ZonedClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string) {
  const cached = clockFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  clockFormatters.set(timeZone, formatter);
  return formatter;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

export function zonedClock(date: Date, timeZone: string = BUSINESS_TIME_ZONE): ZonedClock {
  const values: Record<string, string> = {};
  for (const part of clockFormatter(timeZone).formatToParts(date)) {
    values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    // Some engines render midnight as hour "24" of the previous day.
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** `YYYY-MM-DD` for the given instant, read in the business timezone. */
export function businessDateString(date: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): string {
  const clock = zonedClock(date, timeZone);
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`;
}

function isRealCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Offset of `timeZone` at the given instant, in milliseconds (wall clock minus UTC). */
function zoneOffsetMs(date: Date, timeZone: string) {
  const clock = zonedClock(date, timeZone);
  const wallClockAsUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant matching a wall-clock time inside `timeZone` (two passes cover DST-offset zones). */
export function instantFromWallClock(
  clock: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string = BUSINESS_TIME_ZONE,
): Date {
  const wallClockAsUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  let instant = wallClockAsUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = wallClockAsUtc - zoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

export type TransactionDateOptions = {
  /** Reference instant used for "today" detection and for empty input. */
  now?: Date;
  timeZone?: string;
  /** Instant already recorded on the row being updated; keeps its time-of-day on the same day. */
  preserve?: Date | null;
};

/** Parses a transaction date input into a real instant, or null when unparseable. */
export function parseTransactionDate(input: unknown, options: TransactionDateOptions = {}): Date | null {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? BUSINESS_TIME_ZONE;
  const raw = input === undefined || input === null ? '' : String(input).trim();
  if (!raw) {
    const fallback = options.preserve ?? now;
    return new Date(fallback.getTime());
  }

  const dateOnly = DATE_ONLY.exec(raw);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const clock = { year: Number(year), month: Number(month), day: Number(day) };
    if (!isRealCalendarDate(clock.year, clock.month, clock.day)) return null;
    const preserved = options.preserve ?? null;
    if (preserved && businessDateString(preserved, timeZone) === raw) {
      return new Date(preserved.getTime());
    }
    if (businessDateString(now, timeZone) === raw) {
      return new Date(now.getTime());
    }
    return instantFromWallClock({ ...clock, hour: 0, minute: 0, second: 0 }, timeZone);
  }

  const localDateTime = LOCAL_DATE_TIME.exec(raw);
  if (localDateTime) {
    const [, year, month, day, hour, minute, second] = localDateTime;
    const clock = {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second ?? '0'),
    };
    if (!isRealCalendarDate(clock.year, clock.month, clock.day)) return null;
    if (clock.hour > 23 || clock.minute > 59 || clock.second > 59) return null;
    return instantFromWallClock(clock, timeZone);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
