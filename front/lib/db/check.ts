import 'dotenv/config';
import postgres from 'postgres';
import { databaseConfig } from './config';

async function main() {
  const config = databaseConfig();
  const sql = postgres(config.connectionString, { ...config.options, max: 1 });
  try {
    // Check the current schema as well as connectivity without reading records.
    await sql`select favorited from tracks limit 0`;
    await sql`select id from sources limit 0`;
    await sql`select id from download_preferences limit 0`;
    const protectedTables = await sql`
      select tablename from pg_tables
      where schemaname = 'public' and rowsecurity
        and tablename in ('users', 'teams', 'team_members', 'activity_logs',
          'invitations', 'sources', 'tracks', 'download_preferences', 'downloads')
    `;
    if (protectedTables.length !== 9) {
      throw new Error('Apply the private database migration before starting.');
    }
    console.log('Database connection and library schema are ready.');
  } finally {
    await sql.end();
  }
}

main().catch(() => {
  console.error('Database check failed. Check POSTGRES_URL and apply npm run db:migrate once before starting both computers.');
  process.exitCode = 1;
});
