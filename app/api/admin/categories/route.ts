import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { categories, auditLog } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/helpers/admin';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const rows = await db.select().from(categories).orderBy(categories.type, categories.name);
  return NextResponse.json({ success: true, data: rows }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `categories:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({}));
  const name = String((body as Record<string, unknown>).name ?? '').trim();
  const type = String((body as Record<string, unknown>).type ?? '').trim();
  const parentId = (body as Record<string, unknown>).parentId as string | undefined;

  if (!name || name.length > 120) return envelope(undefined, 'Invalid name', 'name', 400);
  const supported = ['income', 'expense', 'transfer', 'adjustment'];
  if (!supported.includes(type)) return envelope(undefined, 'Invalid type', 'type', 400);

  const [created] = await db.insert(categories).values({
    name,
    type,
    parentId: parentId || undefined,
    isDefault: false,
    isHidden: false
  }).returning();
  await appendAudit(admin.id, 'admin.categories.create', { id: created.id });
  return envelope(created, undefined, undefined, 201);
}

export async function PUT(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `categories:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);

  const [updated] = await db.update(categories).set({ name: (body.name as string | undefined)?.trim(), isHidden: (body.isHidden as boolean | undefined) }).where(eq(categories.id, id)).returning();
  if (!updated) return envelope(undefined, 'Not found', 'id', 404);
  await appendAudit(admin.id, 'admin.categories.update', { id: updated.id });
  return envelope(updated);
}

export async function DELETE(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;
  const admin = authResult.user;
  if (!admin) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `categories:write:${admin.id}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);

  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) return envelope(undefined, 'Not found', 'id', 404);
  if (existing.isDefault) return envelope(undefined, 'Cannot delete system default category', 'id', 403);

  await db.delete(categories).where(eq(categories.id, id));
  await appendAudit(admin.id, 'admin.categories.delete', { id }, ip);
  return envelope({ deleted: true });
}
