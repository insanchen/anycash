// Reset the admin password. Reads environment variables from process.env directly.
// Run with: node --env-file=.env.dev scripts/seed-admin.mjs
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../lib/db/schema.js';
import { hashPassword } from '../lib/auth/argon2.js';
import { eq } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const email = process.env.ADMIN_EMAIL || 'admin@anycash.local';
const password = process.env.ADMIN_PASSWORD || 'dev-password';
const hash = await hashPassword(password);

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
if (existing) {
  await db.update(users).set({ passwordHash: hash }).where(eq(users.email, email));
  console.log('Updated owner password for:', email);
} else {
  const [user] = await db.insert(users).values({ email, passwordHash: hash, role: 'owner' }).returning();
  console.log('Created owner:', JSON.stringify({ id: user.id, email: user.email, role: user.role }));
}
await pool.end();
