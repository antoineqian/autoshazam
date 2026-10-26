import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseConfig } from './config';

test('only the expected local database starts the development Docker container', () => {
  assert.equal(databaseConfig({ POSTGRES_URL: 'postgres://postgres:p@localhost/autoshazam' }).managedLocal, true);
  for (const url of [
    'postgres://postgres:p@localhost:54322/postgres',
    'postgres://postgres:p@localhost:5432/another_app',
    'postgres://postgres:p@remote.example:5432/autoshazam',
  ]) {
    assert.equal(databaseConfig({ POSTGRES_URL: url }).managedLocal, false);
  }
});

test('Supabase connections require encryption and work with transaction pooling', () => {
  for (const host of ['db.project.supabase.co', 'aws-0-eu-west-1.pooler.supabase.com']) {
    const config = databaseConfig({ POSTGRES_URL: `postgres://postgres:p@${host}:6543/postgres` });
    assert.equal(config.local, false);
    assert.equal(config.options.ssl, 'require');
    assert.equal(config.options.prepare, false);
    assert.equal(config.options.max_pipeline, 1);
  }
  assert.equal(databaseConfig({ POSTGRES_URL: 'postgres://postgres:p@localhost/autoshazam' }).options.ssl, undefined);
});

test('invalid configuration errors do not expose credentials', () => {
  assert.throws(() => databaseConfig({}), /POSTGRES_URL environment variable is not set/);
  assert.throws(
    () => databaseConfig({ POSTGRES_URL: 'https://postgres:secret@cloud.example/db' }),
    { message: 'POSTGRES_URL must be a valid PostgreSQL connection URL' },
  );
});
