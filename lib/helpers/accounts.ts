import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts as accountsTable, accountMembers, auditLog } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { hashToken } from '@/lib/auth/hash-token';
import { rateLimit } from '@/lib/auth/rate-limit';

export type AuthContext = {
  userId: string;
  email: string;
  role: string;
};

export async function getUserFromRequest(request: NextRequest): Promise<AuthContext | null> {
  const cookie = (await request.cookies).get(ACCESS_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const payload = verifyAccessToken(cookie);
    return { userId: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export async function authorizeAccountAccess({
  accountId,
  userId,
  role,
  allowMember = false,
}: { accountId: string; userId: string; role: string; allowMember?: boolean }) {
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  if (!account) return envelope(undefined, 'Account not found', 'account_id', 404);
  const isOwner = account.userId === userId;
  const isMember = !!(await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, userId))).limit(1)).length;
  if (isOwner) return null;
  if (!isMember) return envelope(undefined, 'Forbidden', 'account_id', 403);
  if (allowMember || role === 'owner') return null;
  return envelope(undefined, 'Forbidden', 'role', 403);
}
