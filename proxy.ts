import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

const PUBLIC_PREFIXES = [
  '/api/health',
  '/api/auth/',
  '/login',
  // Brand assets + manifest live in /public and must load without auth
  // (e.g. the logo on the login screen, the tab icon, and the PWA manifest).
  '/icon.svg',
  '/logo-appicon.svg',
  '/logo-wordmark.svg',
  '/logo-wordmark-dark.svg',
  '/manifest.webmanifest',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes: API health/auth, login page, and anything under them
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return NextResponse.next();
    }
  }

  // Resource routes perform their own cookie/Bearer authentication and scope checks.
  // Let valid-looking Bearer requests reach the handler instead of requiring a cookie here.
  if (pathname.startsWith('/api/') && request.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.next();
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!access) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    verifyAccessToken(access);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!api/health|api/auth/|_next/static|_next/image|favicon.ico).*)',
  ],
};
