import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCashflowPoints } from '../../components/dashboard/cashflow-chart.ts';

const rows = [
  { date: new Date('2026-10-17T18:00:00Z'), type: 'expense', amount: -30 },
  { date: new Date('2026-10-17T17:00:00Z'), type: 'income', amount: 20 },
  { date: new Date('2026-10-17T16:00:00Z'), type: 'transfer', amount: 999 },
  { date: new Date('2026-10-16T18:00:00Z'), type: 'expense', amount: 10 },
  { date: new Date('2026-10-16T17:00:00Z'), type: 'income', amount: 40 },
  { date: new Date('2026-10-15T17:00:00Z'), type: 'adjustment', amount: -999 },
];

assert.deepEqual(buildCashflowPoints(rows), [
  { date: '2026-10-16', income: 0, expense: 0, x: 20, incomeY: 150, expenseY: 150 },
  { date: '2026-10-17', income: 40, expense: 10, x: 320, incomeY: 38, expenseY: 122 },
  { date: '2026-10-18', income: 20, expense: 30, x: 620, incomeY: 94, expenseY: 66 },
]);
assert.deepEqual(buildCashflowPoints([]), []);
assert.deepEqual(buildCashflowPoints([rows[2], rows[5]]), []);
assert.deepEqual(buildCashflowPoints([{ date: rows[0].date, type: 'expense', amount: -12 }]), [
  { date: '2026-10-18', income: 0, expense: 12, x: 320, incomeY: 150, expenseY: 38 },
]);
assert.deepEqual(buildCashflowPoints([
  { date: rows[0].date, type: 'income', amount: 7 },
  { date: rows[1].date, type: 'income', amount: 3 },
  { date: rows[0].date, type: 'expense', amount: -5 },
]), [
  { date: '2026-10-18', income: 10, expense: 5, x: 320, incomeY: 38, expenseY: 94 },
]);
assert.deepEqual(buildCashflowPoints([{ date: rows[0].date, type: 'income', amount: 0 }]), [
  { date: '2026-10-18', income: 0, expense: 0, x: 320, incomeY: 150, expenseY: 150 },
]);

const page = await readFile(new URL('../../app/dashboard/page.tsx', import.meta.url), 'utf8');
assert.match(page, /buildCashflowPoints\(data\?\.chartRows \?\? \[\]\)/);
assert.match(page, /stroke="var\(--color-income\)"/);
assert.match(page, /stroke="var\(--color-chart-expense\)"/);
assert.match(page, /strokeDasharray="8 6"/);
assert.match(page, /report\.incomeLine/);
assert.match(page, /report\.expenseLine/);
assert.match(page, /report\.empty/);
console.log('Dashboard cashflow checks passed');
