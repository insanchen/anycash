import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { refreshTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { envelope, appendAudit } from '@/lib/auth/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  const rows = await db.select({ id: refreshTokens.id, createdAt: refreshTokens.createdAt })
    .from(refreshTokens).where(and(eq(refreshTokens.userId, auth.userId), isNull(refreshTokens.revokedAt)));
  return envelope(rows);
}

export async function DELETE(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  await db.update(refreshTokens).set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, auth.userId), isNull(refreshTokens.revokedAt)));
  await appendAudit(auth.userId, 'auth.sessions_revoke_all', {}, request.headers.get('x-forwarded-for')?.split(',')[0].trim());
  return envelope({ revoked: true });
}
