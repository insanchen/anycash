const stores = new Map<string, { tokens: number; updatedAt: number }>();

export async function rateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<boolean> {
  const now = Date.now();
  const slot = Math.floor(now / windowMs);
  const storeKey = `${key}:${slot}`;

  const current = stores.get(storeKey);
  if (current && now - current.updatedAt < windowMs) {
    if (current.tokens >= limit) {
      return false;
    }
    current.tokens += 1;
    current.updatedAt = now;
    return true;
  }

  stores.set(storeKey, { tokens: 1, updatedAt: now });
  return true;
}
