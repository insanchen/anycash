import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, accountMembers, userAccountOrder } from '@/lib/db/schema';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accountIds = Array.isArray(body.accountIds) ? body.accountIds.filter((id): id is string => typeof id === 'string') : [];
  if (!accountIds.length || new Set(accountIds).size !== accountIds.length) {
    return envelope(undefined, 'Account order must be a non-empty list of unique ids', 'accountIds', 400);
  }
  const accessible = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, auth.userId));
  const memberRows = await db.select({ id: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, auth.userId));
  const allowed = new Set([...accessible.map((row) => row.id), ...memberRows.map((row) => row.id)]);
  if (accountIds.some((id) => !allowed.has(id))) return envelope(undefined, 'Account access denied', 'accountIds', 403);

  await db.transaction(async (tx) => {
    await tx.delete(userAccountOrder).where(eq(userAccountOrder.userId, auth.userId));
    await tx.insert(userAccountOrder).values(accountIds.map((accountId, position) => ({ userId: auth.userId, accountId, position })));
  });
  return envelope({ accountIds });
}
