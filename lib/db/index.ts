import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { seedIfEmpty } from './seed';

const connectionString = process.env.DATABASE_URL;

let pool: Pool | null = null;
let database: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!database) {
    if (!connectionString) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString });
    database = drizzle(pool, { schema });
    seedIfEmpty().catch(() => {});
  }
  return database;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDb(), prop, receiver);
    if (typeof value === 'function') {
      return value.bind(getDb());
    }
    return value;
  },
});
