/** Opt-in shortcut for dev.sh --admin; never use a NEXT_PUBLIC_ variable here. */
export function devAdminEmail(
  host: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.NODE_ENV !== 'development' || env.DEV_ADMIN_LOGIN !== '1') {
    return null;
  }

  // Use the actual Host header, not a forwarded host supplied by a proxy.
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) {
    return null;
  }

  return env.DEV_ADMIN_EMAIL?.trim() || 'test@test.com';
}
