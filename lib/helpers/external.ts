import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { users, apiKeys, auditLog } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { hashToken } from '@/lib/auth/hash-token';
import { rateLimit } from '@/lib/auth/rate-limit';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';

const API_KEY_PATTERN = /^ac_[0-9a-f]{16}\.[0-9a-f]{64}$/;

export async function resolveBearerApiKey(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const bearer = auth.slice('Bearer '.length).trim();
  if (!API_KEY_PATTERN.test(bearer)) return null;
  const keyHash = hashToken(bearer);
  const rows = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), sql`${apiKeys.revokedAt} IS NULL`)).limit(1);
  if (!rows.length) return null;
  return rows[0];
}

export async function authorizeApiKey(request: NextRequest, requiredScope: string) {
  const apiKey = await resolveBearerApiKey(request);
  if (!apiKey) return envelope(undefined, 'Invalid API key', 'api_key', 401);
  if (!apiKey.scopes.includes(requiredScope) && !apiKey.scopes.includes('*')) {
    return envelope(undefined, 'Forbidden scope', 'scope', 403);
  }
  if (!(await rateLimit({ key: `api:key:${apiKey.id}:${requiredScope}`, limit: apiKey.rateLimit ?? 100, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }
  const [user] = await db.select().from(users).where(eq(users.id, apiKey.userId)).limit(1);
  if (!user) return envelope(undefined, 'User not found', 'user_id', 404);
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));
  return { apiKey, user, scope: requiredScope };
}
