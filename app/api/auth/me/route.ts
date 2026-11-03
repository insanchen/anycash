import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { cookies } from 'next/headers';
import { hashPassword, verifyPassword } from '@/lib/auth/argon2';
import { appendAudit } from '@/lib/auth/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  try {
    const payload = verifyAccessToken(token);
    const [user] = await db.select({ id: users.id, email: users.email, username: users.username, role: users.role })
      .from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: user });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
  }
}

export async function PUT(request: NextRequest) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;

  if (body.current_password || body.new_password) {
    const current = String(body.current_password ?? '');
    const next = String(body.new_password ?? '');
    if (!current || !next) return NextResponse.json({ success: false, error: 'Both current and new password are required', field: 'password' }, { status: 400 });
    if (next.length < 8) return NextResponse.json({ success: false, error: 'New password must be at least 8 characters', field: 'password' }, { status: 400 });

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    const valid = await verifyPassword(current, user.passwordHash);
    if (!valid) return NextResponse.json({ success: false, error: 'Current password is incorrect', field: 'password' }, { status: 401 });

    const nextHash = await hashPassword(next);
    await db.update(users).set({ passwordHash: nextHash }).where(eq(users.id, userId));
    await appendAudit(userId, 'password.reset', { ip }, ip);
    return NextResponse.json({ success: true });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (trimmed.length > 100) return NextResponse.json({ success: false, error: 'Name must be at most 100 characters', field: 'name' }, { status: 400 });
    updates.username = trimmed;
  }
  if (typeof body.email === 'string') {
    const trimmed = body.email.trim();
    if (!trimmed.includes('@')) return NextResponse.json({ success: false, error: 'Invalid email', field: 'email' }, { status: 400 });
    const [existing] = await db.select().from(users).where(eq(users.email, trimmed)).limit(1);
    if (existing && existing.id !== userId) return NextResponse.json({ success: false, error: 'Email already in use', field: 'email' }, { status: 409 });
    updates.email = trimmed;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
  await appendAudit(userId, 'user.update', { updates: Object.keys(updates) }, ip);
  return NextResponse.json({ success: true });
}
