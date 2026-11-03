import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { accounts, accountMembers, transactions, categories, users, userAccountOrder } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { authorizeAccountAccess } from '@/lib/helpers/accounts';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope, appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validTypes = ['personal', 'joint', 'credit_card'] as const;
const VALID_TYPE_SET = new Set<string>(validTypes);

function cleanAccountNumber(raw?: string) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  return trimmed.replace(/[^0-9A-Za-z-]/g, '').slice(0, 64);
}

function parseType(raw: string) {
  const normalized = String(raw ?? '').toLowerCase().trim();
  if (!VALID_TYPE_SET.has(normalized)) throw new Error('Invalid account type');
  return normalized;
}

function parseCreditLimit(raw: unknown) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw new Error('Invalid credit limit');
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'accounts:read');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }
  const typeParam = new URL(request.url).searchParams.get('type')?.trim();
  const owned = await db.select().from(accounts).where(eq(accounts.userId, auth.userId)).orderBy(accounts.createdAt);
  const memberRows = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, auth.userId));
  const memberAccountIds = new Set(memberRows.map(r => r.accountId));
  const ownedIds = new Set(owned.map(a => a.id));
  const extraIds = Array.from(memberAccountIds).filter(id => !ownedIds.has(id));
  const extra = extraIds.length ? await db.select().from(accounts).where(and(...extraIds.map(id => eq(accounts.id, id)))).orderBy(accounts.createdAt) : [];
  let rows = [...owned, ...extra];
  const orderRows = await db.select().from(userAccountOrder).where(eq(userAccountOrder.userId, auth.userId));
  const positionById = new Map(orderRows.map((row) => [row.accountId, row.position]));
  rows = rows.sort((a, b) => (positionById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positionById.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  if (typeParam && VALID_TYPE_SET.has(typeParam)) {
    rows = rows.filter(a => a.type === typeParam);
  }
  const authContext = await authenticateRequest(request);
  const enriched = await Promise.all(
    rows.map(async (account) => {
      const members = await db.select({
        userId: accountMembers.userId,
        role: accountMembers.role,
        username: users.username,
        email: users.email,
      }).from(accountMembers).innerJoin(users, eq(users.id, accountMembers.userId)).where(eq(accountMembers.accountId, account.id));
      const isMember = !authContext || account.userId !== authContext.userId;
      const row: Record<string, unknown> = {
        ...account,
        members,
        accountNumber: isMember ? null : account.accountNumber,
        creditLimit: isMember ? null : account.creditLimit,
        sensitiveMasked: isMember,
      };
      return row;
    })
  );
  return envelope(enriched);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  let type: string;
  try {
    type = parseType(String(body.type));
  } catch {
    return envelope(undefined, 'Invalid type', 'type', 400);
  }
  const currency = String(body.currency ?? 'IDR').trim();
  const accountNumber = cleanAccountNumber(body.accountNumber as string | undefined);
  const membersRaw = Array.isArray(body.members) ? body.members : [];
  let creditLimit: number | null | undefined;
  try {
    creditLimit = body.creditLimit === undefined ? undefined : parseCreditLimit(body.creditLimit);
  } catch {
    return envelope(undefined, 'Invalid credit limit', 'creditLimit', 400);
  }
  const statementDate = typeof body.statementDate === 'number' && Number.isInteger(body.statementDate) && body.statementDate >= 1 && body.statementDate <= 31 ? body.statementDate : undefined;
  const dueDate = typeof body.dueDate === 'number' && Number.isInteger(body.dueDate) && body.dueDate >= 1 && body.dueDate <= 31 ? body.dueDate : undefined;

  if (!name || name.length > 200) return envelope(undefined, 'Invalid name', 'name', 400);
  if (currency.length !== 3 || currency !== currency.toUpperCase()) {
    return envelope(undefined, 'Currency must be ISO-4217 uppercase 3 letters', 'currency', 400);
  }
  if (accountNumber) {
    const [dup] = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber)).limit(1);
    if (dup) return envelope(undefined, 'Account number already used', 'accountNumber', 409);
  }

  const [created] = await db.insert(accounts).values({
    userId: auth.userId,
    name,
    type,
    currency,
    balance: 0,
    accountNumber: accountNumber ?? undefined,
    creditLimit,
    statementDate,
    dueDate,
  }).returning();

  await db.insert(accountMembers).values({ accountId: created.id, userId: auth.userId, role: 'owner' });
  for (const member of membersRaw) {
    const memberId = typeof member === 'string' ? member : (member as Record<string, unknown>)?.userId;
    if (typeof memberId !== 'string' || !memberId) continue;
    const [target] = await db.select().from(users).where(eq(users.id, memberId)).limit(1);
    if (!target) continue;
    await db.insert(accountMembers).values({ accountId: created.id, userId: target.id, role: 'member' });
  }

  await appendAudit(auth.userId, 'accounts.create', { id: created.id, type: created.type }, ip);
  return envelope(created, undefined, undefined, 201);
}

export async function PUT(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);

  const [existing] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!existing) return envelope(undefined, 'Account not found', 'id', 404);
  if (existing.userId !== auth.userId) return envelope(undefined, 'Only account owner can edit', 'role', 403);
  const forbidden = await authorizeAccountAccess({ accountId: id, userId: auth.userId, role: auth.role });
  if (forbidden) return forbidden;

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.type === 'string') {
    try {
      updates.type = parseType(body.type as string);
    } catch {
      return envelope(undefined, 'Invalid type', 'type', 400);
    }
  }
  if (body.accountNumber !== undefined) {
    const normalized = cleanAccountNumber(typeof body.accountNumber === 'string' ? body.accountNumber : String(body.accountNumber));
    updates.accountNumber = normalized;
    if (normalized) {
      const [dup] = await db.select().from(accounts).where(and(eq(accounts.accountNumber, normalized), eq(accounts.id, id))).limit(1);
      if (dup) return envelope(undefined, 'Account number already used', 'accountNumber', 409);
    }
  }
  if (body.creditLimit !== undefined) {
    try {
      updates.creditLimit = parseCreditLimit(body.creditLimit);
    } catch {
      return envelope(undefined, 'Invalid credit limit', 'creditLimit', 400);
    }
  }
  if (typeof body.statementDate === 'number' && Number.isInteger(body.statementDate) && body.statementDate >= 1 && body.statementDate <= 31) updates.statementDate = body.statementDate;
  if (typeof body.dueDate === 'number' && Number.isInteger(body.dueDate) && body.dueDate >= 1 && body.dueDate <= 31) updates.dueDate = body.dueDate;

  if (Array.isArray(body.members)) {
    if (existing.type !== 'joint') return envelope(undefined, 'Members update only applies to joint accounts', 'type', 400);
    await db.delete(accountMembers).where(eq(accountMembers.accountId, id));
    for (const candidate of body.members as unknown[]) {
      const memberId = typeof candidate === 'string' ? candidate : (candidate as Record<string, unknown>)?.userId;
      if (typeof memberId !== 'string' || !memberId) continue;
      const [target] = await db.select().from(users).where(eq(users.id, memberId)).limit(1);
      if (!target) continue;
      await db.insert(accountMembers).values({ accountId: id, userId: target.id, role: 'member' });
    }
    updates.members = body.members;
  }
  if (!Object.keys(updates).length) return envelope(undefined, 'Nothing to update', 'body', 400);

  const [updated] = await db.update(accounts).set(updates).where(eq(accounts.id, id)).returning();
  await appendAudit(auth.userId, 'accounts.update', { id: updated.id, updates }, ip);
  return envelope(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, 'accounts:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `accounts:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '').trim();
  if (action === 'unshare') {
    const id = String(body.id ?? '').trim();
    const memberUserId = String(body.userId ?? '').trim();
    if (!id || !memberUserId) return envelope(undefined, 'Invalid id or userId', 'id', 400);

    const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (!account) return envelope(undefined, 'Account not found', 'id', 404);
    if (account.userId !== auth.userId) return envelope(undefined, 'Only owner can unshare', 'role', 403);
    if (account.type !== 'joint') return envelope(undefined, 'Account is not joint', 'type', 400);
    if (account.userId === memberUserId) return envelope(undefined, 'Cannot unshare owner', 'user_id', 400);

    await db.delete(accountMembers).where(and(eq(accountMembers.accountId, id), eq(accountMembers.userId, memberUserId)));
    await appendAudit(auth.userId, 'accounts.unshare', { accountId: id, userId: memberUserId }, ip);
    return envelope({ unshared: true });
  }

  const id = String(body.id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);

  const [existing] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!existing) return envelope(undefined, 'Account not found', 'id', 404);
  const forbidden = await authorizeAccountAccess({ accountId: id, userId: auth.userId, role: auth.role });
  if (forbidden) return forbidden;

  const txCount = (await db.select().from(transactions).where(eq(transactions.accountId, id)).limit(1)).length;
  if (txCount !== 0) return envelope(undefined, 'Delete all transactions first', 'transactions', 409);

  await appendAudit(auth.userId, 'accounts.delete', { id, name: existing.name }, ip);
  await db.delete(accounts).where(eq(accounts.id, id));
  return envelope({ deleted: true });
}
