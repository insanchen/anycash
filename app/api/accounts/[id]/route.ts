import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, accountMembers, transactions, auditLog } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserFromRequest, authorizeAccountAccess } from '@/lib/helpers/accounts';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

type Context = { params: Promise<{ id: string }> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: Context) {
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '').trim();
  if (action !== 'share') return envelope(undefined, 'Unsupported action', 'action', 400);

  const memberId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!memberId) return envelope(undefined, 'userId is required', 'user_id', 400);

  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return envelope(undefined, 'Account not found', 'id', 404);
  if (account.userId !== auth.userId) return envelope(undefined, 'Only owner can share', 'role', 403);
  if (account.type !== 'joint') return envelope(undefined, 'Account is not joint', 'type', 400);

  const [target] = await db.select().from(users).where(eq(users.id, memberId)).limit(1);
  if (!target) return envelope(undefined, 'User not found', 'user_id', 404);

  const [existing] = await db.select()
    .from(accountMembers)
    .where(and(eq(accountMembers.accountId, id), eq(accountMembers.userId, memberId)))
    .limit(1);
  if (existing) return envelope(undefined, 'Already shared', 'user_id', 409);

  await db.insert(accountMembers).values({ accountId: id, userId: target.id, role: 'member' });
  await appendAudit(auth.userId, 'accounts.share', { accountId: id, userId: target.id }, ip);
  return envelope({ shared: true, accountId: id, userId: target.id });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '').trim();
  if (action !== 'unshare') return envelope(undefined, 'Unsupported action', 'action', 400);

  const memberUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!memberUserId) return envelope(undefined, 'userId is required', 'user_id', 400);

  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!account) return envelope(undefined, 'Account not found', 'id', 404);
  if (account.userId !== auth.userId) return envelope(undefined, 'Only owner can unshare', 'role', 403);
  if (account.type !== 'joint') return envelope(undefined, 'Account is not joint', 'type', 400);
  if (account.userId === memberUserId) return envelope(undefined, 'Cannot unshare owner', 'user_id', 400);

  await db.delete(accountMembers).where(and(eq(accountMembers.accountId, id), eq(accountMembers.userId, memberUserId)));
  await appendAudit(auth.userId, 'accounts.unshare', { accountId: id, userId: memberUserId }, ip);
  return envelope({ unshared: true });
}
