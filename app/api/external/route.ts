import { NextRequest } from 'next/server';
import { authorizeApiKey } from '@/lib/helpers/external';
import { envelope } from '@/lib/auth/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const result = await authorizeApiKey(request, 'transactions:read');
  if (!('apiKey' in result)) return result;
  return envelope({
    status: 'ok',
    scopes: result.apiKey.scopes,
    rateLimit: result.apiKey.rateLimit,
    userId: result.user.id,
    email: result.user.email,
    role: result.user.role,
  });
}

export async function POST(request: NextRequest) {
  return envelope(undefined, 'Not found', 'method', 404);
}
