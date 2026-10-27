const connectionErrorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  '08000', // PostgreSQL connection exception
  '08001', // Unable to establish a connection
  '08003', // Connection does not exist
  '08006', // Connection failure
  '57P01', // Administrative shutdown
  '57P02', // Crash shutdown
  '57P03' // Server starting up
]);

export function isDatabaseConnectionError(error: unknown): boolean {
  const seen = new Set<object>();

  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);

    const candidate = value as { code?: unknown; cause?: unknown };
    if (
      typeof candidate.code === 'string' &&
      connectionErrorCodes.has(candidate.code)
    ) {
      return true;
    }

    if (value instanceof AggregateError && value.errors.length > 0) {
      return value.errors.every(visit);
    }

    return visit(candidate.cause);
  }

  return visit(error);
}
