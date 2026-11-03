import assert from 'node:assert/strict';
const naturalLanguage = await import(new URL('../../lib/transactions/natural-language.ts', import.meta.url).href);
const routing = await import(new URL('../../lib/transactions/routing.ts', import.meta.url).href);
const { parseNaturalTransaction } = naturalLanguage;
const { resolveAccountFromInput, resolvePaymentAccount } = routing;

const accounts = [
  { id: 'cash', name: 'Cash', type: 'personal', currency: 'IDR', createdAt: '2026-08-01' },
  { id: 'bca', name: 'BCA', type: 'personal', currency: 'IDR', createdAt: '2026-08-01' },
  { id: 'dbs', name: 'DBS', type: 'personal', currency: 'IDR', createdAt: '2026-08-01' },
  { id: 'cc-bca', name: 'CC BCA', type: 'credit_card', currency: 'IDR', createdAt: '2026-08-01' },
  { id: 'cc-dbs', name: 'CC DBS', type: 'credit_card', currency: 'IDR', createdAt: '2026-08-01' },
  { id: 'joint', name: 'Joint', type: 'joint', currency: 'IDR', createdAt: '2026-08-01' },
];

const categories: Array<{ id: string; name: string; type: string; parentId: string | null }> = [];

for (const [input, expectedId, expectedType] of [
  ['cc BCA 100k', 'cc-bca', 'credit_card'],
  ['credit DBS 100k', 'cc-dbs', 'credit_card'],
  ['credit card CC BCA 100k', 'cc-bca', 'credit_card'],
  ['tf BCA 100k', 'bca', 'personal'],
  ['transfer DBS 100k', 'dbs', 'personal'],
  ['qris BCA 100k', 'bca', 'personal'],
  ['cash 100k', 'cash', 'personal'],
  ['tunai 100k', 'cash', 'personal'],
  ['100k', 'cash', 'personal'],
] as const) {
  const result = resolveAccountFromInput(input, accounts);
  assert.equal(result.account?.id, expectedId, input);
  assert.equal(result.account?.type, expectedType, input);
}

// A named non-cash account without a payment keyword routes to that account instead of falling
// back to the implicit cash default (the quick-add bug: "45rb bca makan" lost the account).
for (const [input, expectedId, expectedMethod] of [
  ['45rb bca makan siang', 'bca', 'bank_transfer'],
  ['out 45rb dbs makan', 'dbs', 'bank_transfer'],
  ['out 33800 bca alfamart', 'bca', 'bank_transfer'],
  ['out 67rb joint makan', 'joint', 'bank_transfer'],
  ['cc dbs 58rb dinner sate', 'cc-dbs', 'credit_card'],
] as const) {
  const result = resolveAccountFromInput(input, accounts);
  assert.equal(result.error, undefined, input);
  assert.equal(result.account?.id, expectedId, input);
  assert.equal(result.method, expectedMethod, input);
}

// An explicit cash payment with a named bank account is still a contradiction.
assert.match(resolveAccountFromInput('cash BCA 100k', accounts).error ?? '', /cannot use account/);

const inferred = parseNaturalTransaction('out 67rb joint makan', accounts, categories, new Date('2026-08-09T00:00:00Z'));
assert.equal(inferred.accountId, 'joint');
assert.equal(inferred.accountName, 'Joint');
assert.equal(inferred.paymentMethod, 'bank_transfer');

const parsed = parseNaturalTransaction('cc DBS 100k makan', accounts, categories, new Date('2026-08-09T00:00:00Z'));
assert.equal(parsed.accountId, 'cc-dbs');
assert.equal(parsed.accountName, 'CC DBS');
assert.equal(parsed.accountType, 'credit_card');
assert.equal(parsed.paymentMethod, 'credit_card');
assert.equal(parsed.warnings.length, 0);

assert.equal(resolvePaymentAccount(accounts, undefined).account?.id, 'cash');
assert.equal(resolvePaymentAccount(accounts, 'credit', 'DBS').account?.id, 'cc-dbs');
assert.match(resolvePaymentAccount(accounts, 'transfer', 'CC DBS').error ?? '', /wrong type/);
assert.match(resolvePaymentAccount(accounts, 'cc').error ?? '', /required/);
assert.match(resolvePaymentAccount(accounts, 'transfer', 'missing').error ?? '', /not found/);

const ambiguous = resolvePaymentAccount([
  ...accounts,
  { id: 'bca-duplicate', name: 'BCA', type: 'personal' },
], 'transfer', 'BCA');
assert.match(ambiguous.error ?? '', /ambiguous/i);

console.log('transaction routing checks passed');
