import assert from 'node:assert/strict';
import test from 'node:test';
import { isDatabaseConnectionError } from './availability.ts';

test('recognizes the empty AggregateError emitted when localhost refuses connections', () => {
  const refused = (address) => Object.assign(new Error(), {
    code: 'ECONNREFUSED', address
  });
  const error = new AggregateError([refused('::1'), refused('127.0.0.1')]);
  assert.equal(error.message, '');
  assert.equal(isDatabaseConnectionError(error), true);
  assert.equal(isDatabaseConnectionError(new Error('Query failed', { cause: error })), true);
});

test('recognizes driver timeouts and PostgreSQL startup failures', () => {
  for (const code of ['CONNECT_TIMEOUT', 'CONNECTION_CLOSED', '57P03']) {
    assert.equal(isDatabaseConnectionError(Object.assign(new Error(), { code })), true);
  }
});

test('does not hide redirects, schema errors, or unexpected application errors', () => {
  for (const error of [
    new Error('NEXT_REDIRECT'),
    Object.assign(new Error('undefined table'), { code: '42P01' }),
    new TypeError('Unexpected value'),
    new AggregateError([]),
    new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' }), new TypeError()]),
    null
  ]) {
    assert.equal(isDatabaseConnectionError(error), false);
  }
});

test('handles circular causes', () => {
  const error = new Error();
  error.cause = error;
  assert.equal(isDatabaseConnectionError(error), false);
});
