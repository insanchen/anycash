import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const { Client } = pg;
const migrationsDir = '/app/migrations';
const categoriesPath = '/app/seed/categories.json';
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  for (const name of migrationFiles) {
    const { rows } = await client.query('SELECT 1 FROM app_migrations WHERE name = $1', [name]);
    if (rows.length > 0) continue;

    // Databases created before this runner already have these tables.
    // Record their baseline instead of replaying CREATE TABLE statements.
    const { rows: existingUsers } = await client.query("SELECT to_regclass('public.users') AS table_name");
    const { rows: existingSettings } = await client.query("SELECT to_regclass('public.user_settings') AS table_name");
    const isBaselineMigration =
      (name.startsWith('0000_') && existingUsers[0].table_name) ||
      (name.startsWith('0001_') && existingSettings[0].table_name);
    if (isBaselineMigration) {
      await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [name]);
      continue;
    }

    const sql = await readFile(join(migrationsDir, name), 'utf8');
    await client.query('BEGIN');
    try {
      for (const statement of sql.split('--> statement-breakpoint')) {
        const trimmed = statement.trim();
        if (trimmed) await client.query(trimmed);
      }
      await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`migration=applied name=${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@anycash.local';
  const password = process.env.ADMIN_PASSWORD || 'dev-password';
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);

  if (rows.length === 0) {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'owner')",
      [email, hash],
    );
    console.log('admin=created');
  }
}

async function seedCategories() {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM categories');
  if (rows[0].count > 0) return;

  const seed = JSON.parse(await readFile(categoriesPath, 'utf8'));
  await client.query('BEGIN');
  try {
    let parents = 0;
    let children = 0;
    for (const type of ['income', 'expense', 'transfer', 'adjustment']) {
      for (const item of seed[type] || []) {
        const parentId = crypto.randomUUID();
        await client.query(
          'INSERT INTO categories (id, name, type, parent_id, is_default, is_hidden, created_at) VALUES ($1, $2, $3, NULL, true, false, now())',
          [parentId, item.name, type],
        );
        parents += 1;
        for (const name of item.children || []) {
          await client.query(
            'INSERT INTO categories (id, name, type, parent_id, is_default, is_hidden, created_at) VALUES ($1, $2, $3, $4, true, false, now())',
            [crypto.randomUUID(), name, type, parentId],
          );
          children += 1;
        }
      }
    }
    await client.query('COMMIT');
    console.log(`categories=seeded parents=${parents} subcategories=${children}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function ensurePersonalAccounts() {
  await client.query(`
    INSERT INTO accounts (user_id, name, type, currency, balance, created_at)
    SELECT u.id, 'Akun Utama', 'personal', 'IDR', 0, now()
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.type = 'personal'
    )
  `);
  await client.query(`
    INSERT INTO account_members (account_id, user_id, role, joined_at)
    SELECT a.id, a.user_id, 'owner', now()
    FROM accounts a
    WHERE a.name = 'Akun Utama'
      AND a.type = 'personal'
      AND NOT EXISTS (
        SELECT 1 FROM account_members am
        WHERE am.account_id = a.id AND am.user_id = a.user_id
      )
  `);
}

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await client.connect();
  await runMigrations();
  await seedAdmin();
  await ensurePersonalAccounts();
  await seedCategories();
  await client.end();
  const { spawn } = await import('node:child_process');
  const server = spawn('node', ['server.js'], { stdio: 'inherit' });
  server.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
} catch (error) {
  console.error('startup=failed', error);
  await client.end().catch(() => {});
  process.exit(1);
}
