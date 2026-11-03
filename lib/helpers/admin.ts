import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getUserFromRequest, AuthContext } from './accounts';
import { envelope } from '@/lib/auth/handler';

const ADMIN_ROLES = ['admin', 'owner'];

export async function requireAdmin(request: NextRequest): Promise<{ errorResponse: NextResponse | null; user: { id: string; email: string; role: string } | null }> {
  const auth: AuthContext | null = await getUserFromRequest(request);
  if (!auth) {
    return { errorResponse: envelope(undefined, 'Not authenticated', 'auth', 401), user: null };
  }
  const [active] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  const role = active?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return { errorResponse: envelope(undefined, 'Forbidden', 'role', 403), user: null };
  }
  return { errorResponse: null, user: { id: active.id, email: active.email, role } };
}
