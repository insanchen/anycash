import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const source = await readFile(new URL('../app/dashboard/reports/ReportsClient.tsx', import.meta.url), 'utf8');

assert.match(source, /report\.summary/);
assert.match(source, /report\.netCashflow/);
assert.match(source, /aria-label=.*cashflow/i);
assert.match(source, /role="tablist"/);
assert.match(source, /report\.empty/);
assert.match(source, /report\.error/);
assert.match(source, /const chartPadding = 12/);
assert.match(source, /chartPadding \+ \(index \/ Math\.max\(values\.length - 1, 1\)\) \* \(700 - chartPadding \* 2\)/);

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compiled = ts.transpileModule(`${source}\nexport { ReportTable, summarise };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  (id) => id === '@/lib/i18n/client' ? {} : require(id),
  componentModule,
  componentModule.exports,
);
const { ReportTable, summarise } = componentModule.exports;
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

for (const period of ['daily', 'monthly', 'cashflow']) {
  const rows = [
    { income: '100', expense: '-40' },
    { income: '50', expense: '-80' },
    { income: '0', expense: '0' },
  ];
  const html = renderToStaticMarkup(React.createElement(ReportTable, { period, rows, t: (key) => key }));
  const cells = [...html.matchAll(/<td class="([^"]+)">([^<]*)<\/td>/g)];
  for (const [index, expense, net, tone] of [[0, -40, 60, 'income'], [1, -80, -30, 'expense'], [2, 0, 0, 'income']]) {
    assert.equal(cells[index * 3 + 1][2], money(expense));
    assert.equal(cells[index * 3 + 2][2], money(net));
    assert.match(cells[index * 3 + 2][1], new RegExp(`text-${tone}`));
  }
}

const previous = summarise([{ income: '100', expense: '-40' }]);
const current = summarise([{ income: '50', expense: '-80' }]);
assert.equal(previous.net, 60);
assert.equal(previous.savingRate, 60);
assert.equal(current.net, -30);
assert.equal(current.savingRate, 0);
assert.equal(current.net - previous.net, -90);
assert.equal(summarise([{ income: '0', expense: '-40' }]).savingRate, 0);
assert.equal(summarise([{ income: '100', expense: '-40' }, { income: '50', expense: '-80' }]).net, 30);

console.log('Reports UI contract passed');
