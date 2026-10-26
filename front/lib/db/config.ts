/** Connection settings shared by the app, migrations and development scripts. */
export function databaseConfig(env: Record<string, string | undefined> = process.env) {
  const connectionString = env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL environment variable is not set');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    // Never include a connection string (and its password) in an error.
    throw new Error('POSTGRES_URL must be a valid PostgreSQL connection URL');
  }

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const supabase = /\.(supabase\.co|supabase\.com)$/.test(url.hostname);
  return {
    connectionString,
    local,
    // Only manage the container created by dev.sh; other databases are external.
    managedLocal: local && (url.port || '5432') === '5432' &&
      url.pathname === '/autoshazam' && url.username === 'postgres',
    options: {
      prepare: false,
      // Supabase transaction pooling does not support query pipelining.
      max_pipeline: 1,
      max: 5,
      connect_timeout: 15,
      idle_timeout: 20,
      ...(supabase ? { ssl: 'require' as const } : {}),
    },
  };
}
