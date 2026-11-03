import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const seed = JSON.parse(readFileSync(new URL('../lib/db/seed/categories.json', import.meta.url), 'utf-8'));

async function main() {
  const existing = await db.execute(sql`SELECT COUNT(*)::int AS c FROM categories`);
  const count = existing.rows[0].c;
  if (count > 0) {
    console.log(`Categories already seeded (${count} rows). Skipping.`);
    await pool.end();
    return;
  }

  for (const type of ['income', 'expense', 'transfer', 'adjustment']) {
    for (const item of seed[type] || []) {
      const parentId = crypto.randomUUID();
      await db.execute(sql`INSERT INTO categories (id, name, type, parent_id, is_default, is_hidden, created_at) VALUES (${parentId}, ${item.name}, ${type}, NULL, true, false, now())`);
      for (const sub of item.children || []) {
        const subId = crypto.randomUUID();
        await db.execute(sql`INSERT INTO categories (id, name, type, parent_id, is_default, is_hidden, created_at) VALUES (${subId}, ${sub}, ${type}, ${parentId}, true, false, now())`);
      }
    }
  }
  console.log('Seeded categories from categories.json');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
