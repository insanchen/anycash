export type BalanceDelta = readonly [accountId: string, delta: number];

export function aggregateBalanceDeltas(entries: Iterable<BalanceDelta>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [accountId, delta] of entries) {
    if (!accountId || !Number.isInteger(delta)) {
      throw new Error('Balance deltas must contain account IDs and integer amounts');
    }
    totals.set(accountId, (totals.get(accountId) ?? 0) + delta);
  }
  return new Map([...totals.entries()].sort(([leftId], [rightId]) => leftId.localeCompare(rightId)));
}
