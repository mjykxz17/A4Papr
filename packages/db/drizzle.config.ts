import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://cheatsheet:cheatsheet@localhost:5432/cheatsheet',
  },
  strict: true,
  verbose: true,
} satisfies Config;
