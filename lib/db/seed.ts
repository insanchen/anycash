import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db } from './index';
import { users, categories } from './schema';

let done = false;

export async function seedIfEmpty() {
  if (done) return;
  done = true;

  try {
    const existing = await db.select({ c: sql<number>`COUNT(*)::int` }).from(users);
    if (existing.length && existing[0].c > 0) return;
  } catch {
    return;
  }

  try {
    const { hashPassword } = await import('@/lib/auth/argon2');
    const email = process.env.ADMIN_EMAIL || 'admin@anycash.local';
    const password = process.env.ADMIN_PASSWORD || 'dev-password';
    const hash = await hashPassword(password);
    await db.insert(users).values({ email, passwordHash: hash, role: 'owner' });

    const seedData = JSON.parse(readFileSync(join(process.cwd(), 'lib/db/seed/categories.json'), 'utf-8'));
    for (const type of ['income', 'expense', 'transfer', 'adjustment'] as const) {
      for (const item of seedData[type] || []) {
        const pid = crypto.randomUUID();
        await db.insert(categories).values({
          id: pid, name: item.name, type, parentId: null,
          isDefault: true, isHidden: false,
        });
        for (const sub of item.children || []) {
          await db.insert(categories).values({
            id: crypto.randomUUID(), name: sub, type, parentId: pid,
            isDefault: true, isHidden: false,
          });
        }
      }
    }
  } catch {
    done = false;
  }
}
