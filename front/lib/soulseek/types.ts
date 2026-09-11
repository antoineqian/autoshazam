// Mirrors the Pydantic models in backend/src/app/soulseek.py (camelCase JSON).

export type ItemStatus =
  | 'queued'
  | 'searching'
  | 'matched'
  | 'downloading'
  | 'done'
  | 'review'
  | 'not_found'
  | 'failed'
  | 'skipped';

export type Candidate = {
  username: string;
  remotePath: string;
  filename: string;
  folder: string;
  extension: string;
  filesize: number;
  bitrate: number | null;
  duration: number | null;
  vbr: boolean;
  sampleRate: number | null;
  bitDepth: number | null;
  hasFreeSlots: boolean;
  avgSpeed: number;
  queueSize: number;
  matchScore: number;
};

export type Item = {
  id: string;
  title: string;
  subtitle: string;
  sourceLabel: string;
  status: ItemStatus;
  queryUsed: string | null;
  /** 0..1 while downloading */
  progress: number | null;
  localPath: string | null;
  error: string | null;
  attempts: number;
  /** At most three, only meaningful while in review. */
  candidates: Candidate[];
  chosen: Candidate | null;
};

export type Job = {
  id: string;
  createdAt: string;
  items: Item[];
};

export type SoulseekStatus = {
  configured: boolean;
  connected: boolean;
};

export type JobItemInput = {
  title: string;
  subtitle: string;
  sourceLabel: string;
};

const TERMINAL: ReadonlySet<ItemStatus> = new Set([
  'done',
  'not_found',
  'failed',
  'skipped',
]);

export const isTerminal = (status: ItemStatus) => TERMINAL.has(status);

/** Still being worked on, or waiting for the user to pick a candidate. */
export const isActive = (status: ItemStatus) => !isTerminal(status);
