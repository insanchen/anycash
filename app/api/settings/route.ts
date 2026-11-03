import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_LANGUAGE, t } from '@/lib/i18n';

const DICT_FALLBACK = 'id';

function tx(key: string, fallback: string): string {
  const value = t(DEFAULT_LANGUAGE, key);
  if (typeof value === 'string' && value !== key) return value;
  return fallback;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECOMMENDED_SOURCES = ['manual', 'open_er', 'exchangerate-host', 'currencylayer', 'fixer'] as const;
type RateSource = (typeof RECOMMENDED_SOURCES)[number];

function isRecommended(val: unknown): val is RateSource {
  return typeof val === 'string' && (RECOMMENDED_SOURCES as readonly string[]).includes(val);
}

export async function GET(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `settings:${auth.userId}`, limit: 60, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const row = await db.select().from(userSettings).where(eq(userSettings.userId, auth.userId)).limit(1);
  const data = row[0] ?? { userId: auth.userId, rateSource: 'manual' };
  return envelope(data);
}

export async function PUT(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `settings:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({}));
  const rawRateSource = String((body as any).rateSource ?? '').trim().toLowerCase();
  if (!rawRateSource) return envelope(undefined, 'rateSource is required', 'rateSource', 400);
  if (!isRecommended(rawRateSource)) return envelope(undefined, 'Invalid rateSource', 'rateSource', 400);

  await db.insert(userSettings)
    .values({ userId: auth.userId, rateSource: rawRateSource })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { rateSource: rawRateSource, updatedAt: sql`now()` },
    });

  await appendAudit(auth.userId, 'settings.rateSource.update', { rateSource: rawRateSource }, request.headers.get('x-forwarded-for')?.split(',')[0].trim());
  const row = await db.select().from(userSettings).where(eq(userSettings.userId, auth.userId)).limit(1);
  return envelope(row[0] ?? { userId: auth.userId, rateSource: rawRateSource }, undefined, undefined, 200);
}
