import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { authenticateRequest } from '@/lib/auth/auth';
import { rateLimit } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'categories:read');
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `categories:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';
  const rows = await db.select().from(categories);
  const data = type ? rows.filter((c) => c.type === type) : rows;
  return NextResponse.json(
    { success: true, data },
    {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    },
  );
}

export async function POST() {
  return NextResponse.json({ success: false, error: 'Use /api/admin/categories for management', field: 'method' }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ success: false, error: 'Use /api/admin/categories for management', field: 'method' }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ success: false, error: 'Use /api/admin/categories for management', field: 'method' }, { status: 404 });
}
