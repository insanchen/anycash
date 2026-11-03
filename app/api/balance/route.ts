import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { accounts, accountMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'accounts:read');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `balance:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const owned = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, currency: accounts.currency, balance: accounts.balance })
    .from(accounts).where(eq(accounts.userId, auth.userId));

  const memberRows = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, auth.userId));
  const ownedIds = new Set(owned.map(a => a.id));
  const extraIds = memberRows.map(r => r.accountId).filter(id => !ownedIds.has(id));
  const extra = extraIds.length
    ? await db.select({ id: accounts.id, name: accounts.name, type: accounts.type, currency: accounts.currency, balance: accounts.balance })
        .from(accounts).where(eq(accounts.id, extraIds[0]))
    : [];

  const all = [...owned, ...extra];
  return envelope({ accounts: all, total: all.reduce((s, a) => s + a.balance, 0) });
}
