import 'dotenv/config';
import postgres from 'postgres';
import { databaseConfig } from './config';

// Parent tables first, so foreign keys remain valid throughout the copy.
const tables = [
  'users', 'teams', 'team_members', 'activity_logs', 'invitations',
  'sources', 'tracks', 'download_preferences', 'downloads',
] as const;

class CopyError extends Error {}

// App timestamps are PostgreSQL timestamp-without-time-zone. Preserve their
// microseconds and wall-clock values instead of converting through JS Date.
const types = {
  timestamp: {
    to: 1114,
    from: [1114],
    serialize: (value: string) => value,
    parse: (value: string) => value,
  },
};

async function main() {
  if (!process.env.SOURCE_POSTGRES_URL) {
    throw new CopyError('Set SOURCE_POSTGRES_URL to the original database.');
  }
  const sourceConfig = databaseConfig({ POSTGRES_URL: process.env.SOURCE_POSTGRES_URL });
  const targetConfig = databaseConfig({
    POSTGRES_URL: process.env.POSTGRES_MIGRATION_URL || process.env.POSTGRES_URL,
  });
  if (sourceConfig.connectionString === targetConfig.connectionString) {
    throw new CopyError('Source and destination must be different databases.');
  }
  const source = postgres(sourceConfig.connectionString, { ...sourceConfig.options, max: 1, types });
  const target = postgres(targetConfig.connectionString, { ...targetConfig.options, max: 1, types });

  try {
    // A consistent source snapshot, even if its database is being read elsewhere.
    await source.begin('isolation level repeatable read read only', async (from) => {
      await target.begin(async (to) => {
        // Prevent a second import or app write between the empty check and copy.
        for (const table of tables) {
          await to`lock table ${to(table)} in access exclusive mode`;
        }
        for (const table of tables) {
          const [row] = await to`select count(*)::int as count from ${to(table)}`;
          if (row.count !== 0) {
            throw new CopyError('Destination is not empty. Refusing to overwrite or merge existing data.');
          }
        }
        for (const table of tables) {
          const rows = await from`select * from ${from(table)} order by id`;
          for (let offset = 0; offset < rows.length; offset += 500) {
            const batch = rows.slice(offset, offset + 500);
            await to`insert into ${to(table)} ${to(batch, ...Object.keys(batch[0]))}`;
          }
          const [copied] = await to`select count(*)::int as count from ${to(table)}`;
          if (copied.count !== rows.length) throw new CopyError('Row count verification failed.');
          await to`select setval(pg_get_serial_sequence(${table}, 'id'),
            coalesce((select max(id) from ${to(table)}), 1),
            exists(select 1 from ${to(table)}))`;
          console.log(`${table}: ${rows.length} rows verified`);
        }
      });
    });
    console.log('Library copied. The original database was not modified.');
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error) => {
  // Database errors can contain row values or credentials. Only print our errors.
  console.error(error instanceof CopyError
    ? error.message
    : 'Copy did not finish successfully. Check database access and run db:migrate on the destination first.');
  process.exitCode = 1;
});
