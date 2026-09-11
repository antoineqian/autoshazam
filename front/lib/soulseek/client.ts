import type { DownloadPreferences } from './preferences';
import type {
  Candidate,
  Item,
  Job,
  JobItemInput,
  SoulseekStatus,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export class SoulseekApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'SoulseekApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      // Not a JSON error body; keep the status text.
    }
    throw new SoulseekApiError(detail, response.status);
  }

  return response.json() as Promise<T>;
}

export const getSoulseekStatus = () =>
  request<SoulseekStatus>('/soulseek/status');

export const createJob = (
  items: JobItemInput[],
  preferences: DownloadPreferences
) =>
  request<Job>('/soulseek/jobs', {
    method: 'POST',
    body: JSON.stringify({ preferences, items }),
  });

export const getJob = (jobId: string) => request<Job>(`/soulseek/jobs/${jobId}`);

export const chooseCandidate = (
  jobId: string,
  itemId: string,
  candidate: Pick<Candidate, 'username' | 'remotePath'>
) =>
  request<Item>(`/soulseek/jobs/${jobId}/items/${itemId}/choose`, {
    method: 'POST',
    body: JSON.stringify({
      username: candidate.username,
      remotePath: candidate.remotePath,
    }),
  });

export const skipItem = (jobId: string, itemId: string) =>
  request<Item>(`/soulseek/jobs/${jobId}/items/${itemId}/skip`, {
    method: 'POST',
  });

export const retryItem = (jobId: string, itemId: string) =>
  request<Item>(`/soulseek/jobs/${jobId}/items/${itemId}/retry`, {
    method: 'POST',
  });
