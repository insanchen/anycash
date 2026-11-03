import { NextRequest, NextResponse } from 'next/server';
import { handlePost } from '@/app/api/backup/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handlePost(request);
}

export function GET() {
  return NextResponse.redirect(new URL('/api/backup', (process.env.NEXT_PUBLIC_BASE_URL ?? '') + '/'), 307);
}
