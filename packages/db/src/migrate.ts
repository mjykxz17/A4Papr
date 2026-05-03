/**
 * Programmatic migrate runner. Used by `pnpm db:migrate` and CI.
 * Reads DATABASE_URL from the environment.
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb } from './client.js';

async function main(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  await closeDb();
  // eslint-disable-next-line no-console
  console.warn('migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
