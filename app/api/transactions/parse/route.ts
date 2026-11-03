import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, accountMembers, categories } from '@/lib/db/schema';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';
import { parseNaturalTransaction } from '@/lib/transactions/natural-language';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'transactions:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `transactions:parse:${auth.userId}`, limit: 60, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input || input.length > 500) return envelope(undefined, 'Input must be between 1 and 500 characters', 'input', 400);

  const owned = await db.select().from(accounts).where(eq(accounts.userId, auth.userId));
  const memberRows = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, auth.userId));
  const memberIds = memberRows.map((row) => row.accountId).filter((id) => !owned.some((account) => account.id === id));
  const shared = memberIds.length
    ? await db.select().from(accounts).where(inArray(accounts.id, memberIds))
    : [];
  const availableAccounts = [...owned, ...shared];
  const availableCategories = await db.select({ id: categories.id, name: categories.name, type: categories.type, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.isHidden, false));

  const parsed = parseNaturalTransaction(input, availableAccounts, availableCategories);
  return envelope(parsed);
}
