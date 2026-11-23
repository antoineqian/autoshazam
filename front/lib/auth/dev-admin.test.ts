import assert from 'node:assert/strict';
import test from 'node:test';
import { devAdminEmail } from './dev-admin';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

const enabled = { NODE_ENV: 'development', DEV_ADMIN_LOGIN: '1' };

test('requires both development mode and explicit opt-in', () => {
  for (const NODE_ENV of ['production', 'test', undefined]) {
    assert.equal(devAdminEmail('localhost:3000', { ...enabled, NODE_ENV }), null);
  }
  for (const DEV_ADMIN_LOGIN of ['0', 'true', '', undefined]) {
    assert.equal(devAdminEmail('localhost:3000', { ...enabled, DEV_ADMIN_LOGIN }), null);
  }
});

test('allows only loopback hosts, even when enabled', () => {
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST', 'localhost']) {
    assert.equal(devAdminEmail(host, enabled), 'test@test.com');
  }
  for (const host of [null, '', '192.168.1.2:3000', 'example.com', 'localhost.example.com', 'localhost@evil.com', 'localhost:3000,example.com']) {
    assert.equal(devAdminEmail(host, enabled), null);
  }
});

test('supports an explicitly selected existing owner without exposing a public flag', () => {
  assert.equal(devAdminEmail('localhost', { ...enabled, DEV_ADMIN_EMAIL: ' owner@example.com ' }), 'owner@example.com');
  assert.equal(devAdminEmail('localhost', { NODE_ENV: 'development', NEXT_PUBLIC_DEV_ADMIN_LOGIN: '1' }), null);
});

test('middleware bypasses cookie checks only for opted-in local development', async () => {
  const env: Record<string, string | undefined> = process.env;
  const original = { NODE_ENV: env.NODE_ENV, DEV_ADMIN_LOGIN: env.DEV_ADMIN_LOGIN };
  try {
    for (const [mode, flag, host, allowed] of [
      ['development', '1', 'localhost:3000', true],
      ['production', '1', 'localhost:3000', false],
      ['development', '0', 'localhost:3000', false],
      ['development', '1', 'example.com', false],
    ] as const) {
      env.NODE_ENV = mode;
      env.DEV_ADMIN_LOGIN = flag;
      const response = await middleware(new NextRequest('http://localhost:3000/dashboard', {
        headers: { host },
      }));
      assert.equal(response.status, allowed ? 200 : 307);
      assert.equal(response.headers.get('location'), allowed ? null : 'http://localhost:3000/sign-in');
      assert.equal(response.headers.has('set-cookie'), false);
    }

    Object.assign(env, enabled);
    const staleSession = await middleware(new NextRequest('http://localhost:3000/dashboard', {
      headers: { host: 'localhost:3000', cookie: 'session=invalid-old-session' },
    }));
    assert.equal(staleSession.status, 200);
    assert.equal(staleSession.headers.has('set-cookie'), false);

    for (const path of ['/sign-in', '/sign-up']) {
      const response = await middleware(new NextRequest(`http://localhost:3000${path}`, {
        headers: { host: 'localhost:3000' },
      }));
      assert.equal(response.headers.get('location'), 'http://localhost:3000/dashboard');
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});
