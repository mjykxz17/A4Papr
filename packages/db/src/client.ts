import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let _sql: postgres.Sql | undefined;

export function getDb(databaseUrl = process.env.DATABASE_URL): ReturnType<
  typeof drizzle<typeof schema>
> {
  if (_db) return _db;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  _sql = postgres(databaseUrl, {
    max: 10,
    prepare: false,
  });
  _db = drizzle(_sql, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = undefined;
    _db = undefined;
  }
}

export type Db = ReturnType<typeof getDb>;
