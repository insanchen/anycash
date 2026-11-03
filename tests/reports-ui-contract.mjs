import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../app/dashboard/reports/ReportsClient.tsx', import.meta.url), 'utf8');

assert.match(source, /report\.summary/);
assert.match(source, /report\.netCashflow/);
assert.match(source, /aria-label=.*cashflow/i);
assert.match(source, /role="tablist"/);
assert.match(source, /report\.empty/);
assert.match(source, /report\.error/);
assert.match(source, /const chartPadding = 12/);
assert.match(source, /chartPadding \+ \(index \/ Math\.max\(values\.length - 1, 1\)\) \* \(700 - chartPadding \* 2\)/);

console.log('Reports UI contract passed');
