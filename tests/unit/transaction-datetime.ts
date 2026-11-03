import assert from 'node:assert/strict';
import {
  businessDateString,
  instantFromWallClock,
  parseTransactionDate,
  zonedClock,
} from '../../lib/transactions/datetime.ts';

// Asia/Jakarta is UTC+7 all year; every expectation below is written in UTC on purpose.
assert.equal(businessDateString(new Date('2026-10-16T16:59:59Z')), '2026-10-16');
assert.equal(businessDateString(new Date('2026-10-16T17:00:00Z')), '2026-10-17');
assert.deepEqual(zonedClock(new Date('2026-10-16T09:22:53Z')), {
  year: 2026,
  month: 10,
  day: 16,
  hour: 16,
  minute: 22,
  second: 53,
});
assert.equal(
  instantFromWallClock({ year: 2026, month: 10, day: 16, hour: 0, minute: 0, second: 0 }).toISOString(),
  '2026-10-15T17:00:00.000Z',
);

const now = new Date('2026-10-16T09:22:53Z');

// A date-only value for today records the current moment. That was the bug: every chat entry
// read 07:00 because a bare `YYYY-MM-DD` was parsed as UTC midnight.
assert.equal(parseTransactionDate('2026-10-16', { now })?.toISOString(), now.toISOString());
assert.equal(parseTransactionDate(undefined, { now })?.toISOString(), now.toISOString());
assert.equal(parseTransactionDate('', { now })?.toISOString(), now.toISOString());

// Any other day keeps the written date at local midnight.
assert.equal(parseTransactionDate('2026-10-15', { now })?.toISOString(), '2026-10-14T17:00:00.000Z');
assert.equal(parseTransactionDate('2026-10-17', { now })?.toISOString(), '2026-10-16T17:00:00.000Z');

// "Today" is judged in the business timezone, not in UTC.
const earlyMorning = new Date('2026-10-16T00:30:00Z'); // 07:30 WIB on the 16th
assert.equal(parseTransactionDate('2026-10-16', { now: earlyMorning })?.toISOString(), earlyMorning.toISOString());
assert.equal(parseTransactionDate('2026-10-15', { now: earlyMorning })?.toISOString(), '2026-10-14T17:00:00.000Z');
const lateNight = new Date('2026-10-16T17:30:00Z'); // 00:30 WIB on the 17th
assert.equal(parseTransactionDate('2026-10-17', { now: lateNight })?.toISOString(), lateNight.toISOString());

// Instants that already carry a zone are never reinterpreted.
assert.equal(parseTransactionDate('2026-10-16T20:45:00+07:00')?.toISOString(), '2026-10-16T13:45:00.000Z');
assert.equal(parseTransactionDate('2026-10-16T00:00:00.000Z')?.toISOString(), '2026-10-16T00:00:00.000Z');
// A zone-less local date-time belongs to the business timezone.
assert.equal(parseTransactionDate('2026-10-16T08:15')?.toISOString(), '2026-10-16T01:15:00.000Z');

// Updates keep the recorded time-of-day while the day is unchanged.
const stored = new Date('2026-10-16T04:05:06Z');
assert.equal(parseTransactionDate('2026-10-16', { now, preserve: stored })?.toISOString(), stored.toISOString());
assert.equal(parseTransactionDate('2026-10-14', { now, preserve: stored })?.toISOString(), '2026-10-13T17:00:00.000Z');

// Rejected inputs.
assert.equal(parseTransactionDate('2026-02-30'), null);
assert.equal(parseTransactionDate('2026-10-16T25:00'), null);
assert.equal(parseTransactionDate('not-a-date'), null);

console.log('transaction datetime checks passed');
