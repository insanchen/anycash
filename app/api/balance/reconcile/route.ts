import { NextRequest } from 'next/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, accountMembers, transactions } from '@/lib/db/schema';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'accounts:read');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `balance:reconcile:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const owned = await db.select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, auth.userId));
  const memberRows = await db.select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(eq(accountMembers.userId, auth.userId));
  const accountIds = Array.from(new Set([...owned.map((row) => row.id), ...memberRows.map((row) => row.accountId)]));

  if (!accountIds.length) return envelope({ accounts: [], driftCount: 0, inSync: true });

  const [accountRows, ledgerRows] = await Promise.all([
    db.select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      currency: accounts.currency,
      storedBalance: accounts.balance,
    }).from(accounts).where(inArray(accounts.id, accountIds)),
    db.select({
      accountId: transactions.accountId,
      ledgerBalance: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    }).from(transactions)
      .where(inArray(transactions.accountId, accountIds))
      .groupBy(transactions.accountId),
  ]);

  const ledgerByAccount = new Map(ledgerRows.map((row) => [row.accountId, Number(row.ledgerBalance ?? 0)]));
  const reconciled = accountRows.map((account) => {
    const ledgerBalance = ledgerByAccount.get(account.id) ?? 0;
    const drift = Number(account.storedBalance) - ledgerBalance;
    return { ...account, ledgerBalance, drift, inSync: drift === 0 };
  });
  const driftCount = reconciled.filter((account) => !account.inSync).length;
  return envelope({ accounts: reconciled, driftCount, inSync: driftCount === 0 });
}