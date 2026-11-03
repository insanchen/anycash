import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, refreshTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE, REFRESH_COOKIE, buildAuthCookieOptions } from '@/lib/auth/cookies';
import { hashToken } from '@/lib/auth/hash-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const header = request.headers.get('x-demo-auth');
  const userId = header || new URL(request.url).searchParams.get('userId') || '';
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
  const refreshTokenHash = hashToken(refreshToken);
  await db.insert(refreshTokens).values({ userId: user.id, tokenHash: refreshTokenHash, revokedAt: null });
  const response = NextResponse.json({ success: true, data: { id: user.id, email: user.email, role: user.role } });
  const base = buildAuthCookieOptions();
  response.cookies.set({ ...base, name: ACCESS_COOKIE, value: accessToken, maxAge: 900 });
  response.cookies.set({ ...base, name: REFRESH_COOKIE, value: refreshToken, maxAge: 2592000 });
  return response;
}
