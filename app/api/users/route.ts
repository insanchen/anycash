import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, auditLog } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { requireAdmin } from '@/lib/helpers/admin';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';
import argon2 from 'argon2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLE_COLUMNS = {
  users: ['id', 'email', 'username', 'role', 'created_at'],
  owner: ['id', 'email', 'username', 'role', 'created_at'],
  admin: ['id', 'email', 'role', 'created_at'],
  member: ['id', 'email', 'username', 'created_at'],
} as const;

const ROLE = Object.freeze({
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const);

async function canAccessUser(admin: { id: string; role: string }, userId: string) {
  if (admin.role === ROLE.owner) return true;
  if (admin.role === ROLE.admin) {
    const [target] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (target?.role === ROLE.owner) return false;
  }
  return false;
}

async function maskPasswordHash(session: { id: string; role: string } | null) {
  if (!session || session.role !== ROLE.owner) {
    return sql`'***'::text as password_hash`;
  }
  return sql`''::text as password_hash`;
}

export async function GET(request: NextRequest) {
  const self = await getUserFromRequest(request);
  if (self?.role === ROLE.member) {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, self.userId)).limit(1);
    return user ? envelope([user]) : envelope(undefined, 'Not found', 'auth', 404);
  }

  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `users:read:${admin.id}`, limit: 120, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const adminRole = admin.role;

  let selector;
  if (adminRole === ROLE.owner) {
    selector = db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      passwordHash: sql<string>`'***'::text as password_hash`,
    }).from(users);
  } else if (adminRole === ROLE.admin) {
    const base = db.select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      passwordHash: sql<string>`'***'::text as password_hash`,
    }).from(users).where(sql`${users.role} <> 'owner'::varchar(10)`);

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim();
    if (q) {
      const like = `%${q.replace(/%/g, '\\%')}%`;
      const rows = await base.orderBy(users.createdAt);
      const filtered = rows.filter(
        (row) =>
          (row.email ?? '').toLowerCase().includes((q as string).toLowerCase()) ||
          (row.username ?? '').toLowerCase().includes((q as string).toLowerCase())
      );
      return envelope(filtered);
    }

    selector = base;
  } else {
    return envelope(undefined, 'Forbidden', 'role', 403);
  }

  const rows = await selector.orderBy(users.createdAt);
  return envelope(rows);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `users:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  if (admin.role === ROLE.admin) {
    const body = await request.json().catch(() => ({}));
    const role = String((body as Record<string, unknown>).role ?? '').trim();
    if (role === ROLE.owner) {
      return envelope(undefined, 'Admins cannot create owners', 'role', 403);
    }
  }

  const body = await request.json().catch(() => ({}));
  const email = String((body as Record<string, unknown>).email ?? '').trim().toLowerCase();
  const username = String((body as Record<string, unknown>).username ?? '').trim() || undefined;
  const password = String((body as Record<string, unknown>).password ?? '').trim();
  const role = String((body as Record<string, unknown>).role ?? '').trim();

  if (!email || email.length > 320) return envelope(undefined, 'Invalid email', 'email', 400);
  if (!password || password.length < 8) return envelope(undefined, 'Password must be at least 8 characters', 'password', 400);
  const supported = [ROLE.owner, ROLE.admin, ROLE.member];
  const finalRole = role || ROLE.member;
  if (!supported.includes(finalRole as (typeof supported)[number])) return envelope(undefined, 'Invalid role', 'role', 400);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    await appendAudit(admin.id, 'admin.users.create_failed', { email, reason: 'email_exists' }, ip);
    return envelope(undefined, 'Email already registered', 'email', 409);
  }

  const passwordHash = await argon2.hash(password);
  const [created] = await db.insert(users).values({ email, username, passwordHash, role: finalRole as (typeof supported)[number] }).returning({ id: users.id, email: users.email, username: users.username, role: users.role, createdAt: users.createdAt });

  await appendAudit(admin.id, 'admin.users.create', { id: created.id, email: created.email, role: created.role }, ip);
  return envelope(created, undefined, undefined, 201);
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `users:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({}));
  const id = String((body as Record<string, unknown>).id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = existing[0];
  if (!target) return envelope(undefined, 'Not found', 'id', 404);
  if (admin.role !== ROLE.owner && target.role === ROLE.owner) {
    return envelope(undefined, 'Admins cannot modify owners', 'role', 403);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();

  const allowedFields: string[] = ['email', 'username', 'role'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if ((body as Record<string, unknown>)[field] !== undefined) {
      updates[field] = String((body as Record<string, unknown>)[field] ?? '').trim();
    }
  }

  if (updates.email) updates.email = updates.email.toString().toLowerCase();
  if (updates.role && !['owner','admin','member'].includes(updates.role as string)) {
    return envelope(undefined, 'Invalid role', 'role', 400);
  }
  if (admin.role === ROLE.admin && updates.role === ROLE.owner) {
    return envelope(undefined, 'Admins cannot assign owner role', 'role', 403);
  }

  const sameEmailUser = await db.select().from(users).where(eq(users.email, updates.email as string)).limit(1);
  if ((sameEmailUser[0]?.id ?? '') !== id) {
    return envelope(undefined, 'Email already registered', 'email', 409);
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning({ id: users.id, email: users.email, username: users.username, role: users.role, createdAt: users.createdAt, passwordHash: sql<string>`'***'::text as password_hash` });

  await appendAudit(admin.id, 'admin.users.update', { id: updated.id, changes: Object.keys(updates) }, ip);
  return envelope(updated);
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `users:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({}));
  const id = String((body as Record<string, unknown>).id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);
  if (id === admin.id) return envelope(undefined, 'You cannot delete your own account', 'id', 400);

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = existing[0];
  if (!target) return envelope(undefined, 'Not found', 'id', 404);
  if (admin.role !== ROLE.owner && target.role === ROLE.owner) {
    return envelope(undefined, 'Admins cannot delete owners', 'role', 403);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();

  await db.delete(users).where(eq(users.id, id));
  await appendAudit(admin.id, 'admin.users.delete', { id, email: target.email }, ip);
  return envelope({ deleted: true, id });
}
