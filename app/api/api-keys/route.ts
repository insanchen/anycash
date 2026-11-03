import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { hashToken, randomPrefix } from '@/lib/auth/hash-token';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pickScopes(raw: unknown): string[] {
  const allowed = new Set([
    'transactions:read',
    'transactions:write',
    'accounts:read',
    'accounts:write',
    'categories:read',
    'categories:write',
    'backup:read',
    'backup:write',
  ]);
  const values = Array.isArray((raw as any)?.scopes) ? (raw as any).scopes : [];
  const out = values.filter((s: unknown) => allowed.has(String(s)));
  return out;
}

export async function GET(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `api-keys:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const rows = await db.select({
    id: apiKeys.id,
    keyPrefix: apiKeys.keyPrefix,
    name: apiKeys.name,
    scopes: apiKeys.scopes,
    rateLimit: apiKeys.rateLimit,
    revokedAt: apiKeys.revokedAt,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
  })
    .from(apiKeys)
    .where(eq(apiKeys.userId, auth.userId))
    .orderBy(desc(apiKeys.createdAt));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const auth = await getUserFromRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `api-keys:write:${auth.userId}`, limit: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const scopes = pickScopes(body);
  const rateLimitRaw = typeof body.rateLimit === 'number' ? body.rateLimit : 100;

  if (name.length > 120) return NextResponse.json({ success: false, error: 'Invalid name', field: 'name' }, { status: 400 });
  if (!Number.isFinite(rateLimitRaw) || rateLimitRaw <= 0) return NextResponse.json({ success: false, error: 'Invalid rateLimit', field: 'rate_limit' }, { status: 400 });

  const keyValue = `ac_${randomPrefix(8)}.${cryptoRandom(32)}`;
  const keyHash = hashToken(keyValue);
  const keyPrefix = keyValue.slice(0, 19);

  const [created] = await db.insert(apiKeys).values({
    userId: auth.userId,
    keyPrefix,
    keyHash,
    name: name || 'API Key',
    scopes,
    rateLimit: Math.trunc(rateLimitRaw),
  }).returning({
    id: apiKeys.id,
    keyPrefix: apiKeys.keyPrefix,
    name: apiKeys.name,
    scopes: apiKeys.scopes,
    rateLimit: apiKeys.rateLimit,
    revokedAt: apiKeys.revokedAt,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
  });

  await appendAudit(auth.userId, 'api_keys.create', { id: created.id, prefix: created.keyPrefix, scopes: created.scopes }, ip);
  return NextResponse.json({ success: true, data: { ...created, key: keyValue } }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `api-keys:write:${auth.userId}`, limit: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ success: false, error: 'Invalid id', field: 'id' }, { status: 400 });

  const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!existing) return NextResponse.json({ success: false, error: 'Not found', field: 'id' }, { status: 404 });
  if (existing.userId !== auth.userId) return NextResponse.json({ success: false, error: 'Forbidden', field: 'id' }, { status: 403 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  await appendAudit(auth.userId, 'api_keys.revoke', { id, name: existing.name }, ip);
  return NextResponse.json({ success: true, data: { revoked: true } });
}

function cryptoRandom(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
