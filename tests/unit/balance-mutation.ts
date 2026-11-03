import assert from 'node:assert/strict';
import { aggregateBalanceDeltas } from '../../lib/transactions/balance.ts';

const deltas = aggregateBalanceDeltas([
  ['source', -100],
  ['destination', 100],
  ['source', 25],
]);

assert.deepEqual(Object.fromEntries(deltas), {
  source: -75,
  destination: 100,
});
console.log('balance mutation checks passed');
