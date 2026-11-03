import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, refreshTokens, auditLog } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export function envelope(data?: unknown, error?: string, field?: string, status = 200) {
  return NextResponse.json(
    { success: data !== undefined, data, error: error ?? null, field: field ?? null },
    { status }
  );
}

export async function appendAudit(
  userId: string | undefined,
  action: string,
  details: Record<string, unknown> = {},
  ip?: string
) {
  try {
    await db.insert(auditLog).values({
      userId: userId ?? sql`NULL`,
      action,
      details: JSON.stringify(details),
      ipAddress: ip,
    });
  } catch {
    // Audit logging is best-effort. A failed write must not fail the request.
  }
}
