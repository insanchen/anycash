import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { authorizeApiKey } from '@/lib/helpers/external';
import { envelope } from './handler';

export async function authenticateRequest(
  request: NextRequest,
  requiredScope?: string
): Promise<{ userId: string; email: string; role: string } | null> {
  const cookieAuth = await getUserFromRequest(request);
  if (cookieAuth) return cookieAuth;

  if (!requiredScope) return null;

  const apiResult = await authorizeApiKey(request, requiredScope);
  if (apiResult && 'apiKey' in apiResult) {
    return { userId: apiResult.user.id, email: apiResult.user.email, role: apiResult.user.role };
  }

  return null;
}
