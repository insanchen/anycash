import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [transactionsRoute, reportsRoute, exportRoute, client] = await Promise.all([
  readFile(new URL('../app/api/transactions/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/reports/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/reports/export/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/dashboard/transactions/TransactionsClient.tsx', import.meta.url), 'utf8'),
]);

// Writes go through the business-timezone date parser, never through a bare `new Date(...)` on a
// `YYYY-MM-DD` string (that stored UTC midnight and displayed as 07:00 WIB).
assert.match(transactionsRoute, /parseTransactionDate\(body\.date\)/);
assert.match(transactionsRoute, /parseTransactionDate\(\(body as any\)\.date, \{ preserve: tx\.date \}\)/);
assert.doesNotMatch(transactionsRoute, /new Date\(String\(body\.date/);

// An unknown category gets a field-level 400 before it can reach the foreign key and turn into a 500.
assert.match(transactionsRoute, /unknownCategory\(categoryId\)/);
assert.match(transactionsRoute, /databaseFailure\(error\)/);

// Reports and CSV exports group and bound by the business day, matching what the UI displays.
for (const source of [reportsRoute, exportRoute]) {
  // The timezone has to be a literal. PostgreSQL compares SELECT and GROUP BY expressions
  // structurally, two separate parameters never match, and the report then fails with
  // "column transactions.date must appear in the GROUP BY clause".
  assert.match(source, /AT TIME ZONE \$\{timeZoneLiteral\}/);
  assert.doesNotMatch(source, /AT TIME ZONE \$\{BUSINESS_TIME_ZONE\}/);
  assert.match(source, /to_char\(date_trunc\('day'/);
  assert.doesNotMatch(source, /date_trunc\('day', \$\{transactions\.date\}\)/);
  assert.doesNotMatch(source, /new Date\(upperBound\.getFullYear\(\)/);
}

// The quick-add form must not take its default date from UTC.
assert.doesNotMatch(client, /toISOString\(\)\.slice\(0, 10\)/);
assert.match(client, /date: businessDateString\(\)/);
// Changing the account in the preview clears the parse-derived routing fields.
assert.match(client, /account_id: e\.target\.value, account_name: '', payment_method: ''/);

console.log('transaction date/routing contract passed');
