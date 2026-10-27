import type { Config } from 'drizzle-kit';
import 'dotenv/config';
import { databaseConfig } from './lib/db/config';

const config = databaseConfig({
  ...process.env,
  POSTGRES_URL: process.env.POSTGRES_MIGRATION_URL || process.env.POSTGRES_URL,
});

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.connectionString,
    ...(config.options.ssl ? { ssl: config.options.ssl } : {}),
  },
} satisfies Config;
