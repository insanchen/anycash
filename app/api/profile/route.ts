import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { envelope, appendAudit } from '@/lib/auth/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  const [user] = await db.select({ email: users.email, username: users.username, role: users.role, createdAt: users.createdAt })
    .from(users).where(eq(users.id, auth.userId)).limit(1);
  if (!user) return envelope(undefined, 'Not found', 'auth', 404);
  return envelope(user);
}

export async function PUT(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const username = String(body.username ?? '').trim();
  if (username.length > 100) return envelope(undefined, 'Name must be at most 100 characters', 'username', 400);
  const [user] = await db.update(users).set({ username: username || null }).where(eq(users.id, auth.userId))
    .returning({ email: users.email, username: users.username, role: users.role, createdAt: users.createdAt });
  await appendAudit(auth.userId, 'profile.update', { username: user.username }, request.headers.get('x-forwarded-for')?.split(',')[0].trim());
  return envelope(user);
}
