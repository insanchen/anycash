import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const locale = typeof body.locale === 'string' ? body.locale.toLowerCase() : null;
  if (!token || !locale) {
    return NextResponse.json({ success: false, error: 'Unauthorized or invalid payload' }, { status: 401 });
  }
  try {
    verifyAccessToken(token);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: 'locale',
    value: locale,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
