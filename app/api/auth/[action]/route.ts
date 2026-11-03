import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, refreshTokens, auditLog, accounts, accountMembers } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '@/lib/auth/argon2';
import { signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken, type JwtPayload } from '@/lib/auth/jwt';
import { hashToken } from '@/lib/auth/hash-token';
import { rateLimit } from '@/lib/auth/rate-limit';
import { t, DEFAULT_LANGUAGE } from '@/lib/i18n';
import { envelope } from '@/lib/auth/handler';
import { ACCESS_COOKIE, REFRESH_COOKIE, buildAuthCookieOptions } from '@/lib/auth/cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maxAgeAccess = Number(process.env.ACCESS_TOKEN_TTL || 900);
const maxAgeRefresh = Number(process.env.REFRESH_TOKEN_TTL || 2592000);
const secureCookies = process.env.NODE_ENV === 'production';

const registerSchema = {
  email: (v: unknown) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 320,
  username: (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.length <= 100),
  password: (v: unknown) => typeof v === 'string' && v.length >= 8,
};

const loginSchema = {
  email: (v: unknown) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 320,
  password: (v: unknown) => typeof v === 'string' && v.length >= 1,
};

function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const base = buildAuthCookieOptions();
  response.cookies.set({
    ...base,
    name: ACCESS_COOKIE,
    value: accessToken,
    maxAge: maxAgeAccess,
  });
  response.cookies.set({
    ...base,
    name: REFRESH_COOKIE,
    value: refreshToken,
    maxAge: maxAgeRefresh,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const lang = DEFAULT_LANGUAGE;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;

  if (!['register', 'login', 'logout', 'refresh', 'change-password'].includes(action)) {
    return envelope(undefined, t(lang, 'bad_request'), 'action', 404);
  }

  if (action === 'register') {
    const rateKey = `auth:register:${ip ?? 'unknown'}`;
    if (!(await rateLimit({ key: rateKey, limit: 20, windowMs: 60_000 }))) {
      return envelope(undefined, t(lang, 'rate_limited'), undefined, 429);
    }

    const body = await request.json().catch(() => ({}));
    const email = (body as Record<string, unknown>).email;
    const username = (body as Record<string, unknown>).username;
    const password = (body as Record<string, unknown>).password;

    if (!registerSchema.email(email)) return envelope(undefined, t(lang, 'bad_request'), 'email', 400);
    if (!registerSchema.username(username)) return envelope(undefined, t(lang, 'bad_request'), 'username', 400);
    if (!registerSchema.password(password)) return envelope(undefined, t(lang, 'bad_request'), 'password', 400);

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length) {
      return envelope(undefined, t(lang, 'register_email_exists'), 'email', 409);
    }

    const passwordHash = await hashPassword(String(password));
    const user = await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(users).values({
        email: normalizedEmail,
        username: username ? String(username).trim() : null,
        passwordHash,
        role: 'owner',
      }).returning({ id: users.id, email: users.email, role: users.role, username: users.username });
      const [mainAccount] = await tx.insert(accounts).values({
        userId: createdUser.id,
        name: 'Akun Utama',
        type: 'personal',
        currency: 'IDR',
        balance: 0,
      }).returning({ id: accounts.id });
      await tx.insert(accountMembers).values({ accountId: mainAccount.id, userId: createdUser.id, role: 'owner' });
      return createdUser;
    });

    const jwtPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    await db.insert(auditLog).values({
      userId: user.id,
      action: 'auth.register',
      details: JSON.stringify({ email: user.email }),
      ipAddress: ip,
    });

    const response = envelope({ id: user.id, email: user.email, username: user.username, role: user.role }, undefined, undefined, 201);
    setAuthCookies(response, accessToken, refreshToken);
    const refreshTokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({ userId: user.id, tokenHash: refreshTokenHash, revokedAt: null });
    return response;
  }

  if (action === 'login') {
    const rateKey = `auth:login:${ip ?? 'unknown'}`;
    if (!(await rateLimit({ key: rateKey, limit: 20, windowMs: 60_000 }))) {
      return envelope(undefined, t(lang, 'rate_limited'), undefined, 429);
    }

    // Credentials can arrive as JSON or as form data.
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData().catch(() => null);
      if (formData) {
        formData.forEach((value, key) => { body[key] = value; });
      }
    }

    const email = body.email as string | undefined;
    const password = body.password as string | undefined;

    if (!loginSchema.email(email)) return envelope(undefined, t(lang, 'bad_request'), 'email', 400);
    if (!loginSchema.password(password)) return envelope(undefined, t(lang, 'bad_request'), 'password', 400);

    const normalizedEmail = String(email).toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (!user) {
      return envelope(undefined, t(lang, 'login_invalid_email'), 'email', 401);
    }

    const valid = await verifyPassword(String(password), user.passwordHash);
    if (!valid) {
      return envelope(undefined, t(lang, 'login_invalid_password'), 'password', 401);
    }

    const jwtPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    // Delete the user's old refresh token before inserting the new one (avoids a race with concurrent logins)
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));

    await db.insert(auditLog).values({
      userId: user.id,
      action: 'auth.login',
      details: JSON.stringify({ email: user.email }),
      ipAddress: ip,
    });

    const response = envelope({ id: user.id, email: user.email, username: user.username, role: user.role });
    setAuthCookies(response, accessToken, refreshToken);
    const refreshTokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({ userId: user.id, tokenHash: refreshTokenHash, revokedAt: null });
    return response;
  }

  if (action === 'change-password') {
    const access = request.cookies.get(ACCESS_COOKIE)?.value;
    if (!access) return envelope(undefined, 'Not authenticated', 'auth', 401);
    let payload: JwtPayload;
    try { payload = verifyAccessToken(access); }
    catch { return envelope(undefined, 'Not authenticated', 'auth', 401); }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');
    if (newPassword.length < 8) return envelope(undefined, 'New password must be at least 8 characters', 'newPassword', 400);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return envelope(undefined, 'Current password is incorrect', 'currentPassword', 401);
    }
    await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, user.id));
    await db.insert(auditLog).values({ userId: user.id, action: 'auth.password_change', details: '{}', ipAddress: ip });
    return envelope({ changed: true });
  }

  if (action === 'logout') {
    const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
    const access = request.cookies.get(ACCESS_COOKIE)?.value;

    if (refresh) {
      const refreshHash = hashToken(refresh);
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, refreshHash));
    }

    // With a valid access token, revoke every active refresh token for this user
    if (access) {
      try {
        const payload = verifyAccessToken(access);
        await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, payload.sub));
        await db.insert(auditLog).values({
          userId: payload.sub,
          action: 'auth.logout',
          details: JSON.stringify({ via: 'cookie' }),
          ipAddress: ip,
        });
      } catch {
        // The access token was invalid, but still log the logout attempt
        await db.insert(auditLog).values({
          userId: sql`NULL`,
          action: 'auth.logout',
          details: JSON.stringify({ via: 'cookie', access_invalid: true }),
          ipAddress: ip,
        });
      }
    } else {
      await db.insert(auditLog).values({
        userId: sql`NULL`,
        action: 'auth.logout',
        details: JSON.stringify({ via: 'cookie' }),
        ipAddress: ip,
      });
    }
    const response = envelope(null);
    response.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, path: '/', secure: secureCookies, maxAge: 0, sameSite: 'strict' });
    response.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: '/', secure: secureCookies, maxAge: 0, sameSite: 'strict' });
    return response;
  }

  if (action === 'refresh') {
    const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refresh) {
      return envelope(undefined, t(lang, 'refresh_invalid'), undefined, 401);
    }

    const refreshHash = hashToken(refresh);
    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, refreshHash)).limit(1);
    const row = rows[0];
    if (!row || row.revokedAt) {
      return envelope(undefined, t(lang, 'refresh_invalid'), undefined, 401);
    }

    let payload: JwtPayload;
    try {
      payload = verifyRefreshToken(refresh);
    } catch {
      return envelope(undefined, t(lang, 'refresh_invalid'), undefined, 401);
    }

    const newAccess = signAccessToken({ sub: payload.sub, email: payload.email, role: payload.role });
    const newRefresh = signRefreshToken({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    });

    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    const newRefreshHash = hashToken(newRefresh);
    if (row.tokenHash !== newRefreshHash) {
      await db.insert(refreshTokens).values({ userId: payload.sub, tokenHash: newRefreshHash, revokedAt: null });
    }
    await db.insert(auditLog).values({
      userId: payload.sub,
      action: 'auth.refresh',
      details: JSON.stringify({ via: 'cookie' }),
      ipAddress: ip,
    });

    const response = envelope({ refreshed: true });
    setAuthCookies(response, newAccess, newRefresh);
    return response;
  }

  return envelope(undefined, t(lang, 'bad_request'), 'action', 404);
}
