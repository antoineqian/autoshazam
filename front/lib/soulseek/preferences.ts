// Client-safe: no server-only imports, shared by the settings card, the
// library view and the server actions.

export const DOWNLOAD_FORMATS = [
  'flac',
  'mp3',
  'aiff',
  'wav',
  'm4a',
  'ogg',
] as const;

export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export const MP3_BITRATES = [320, 256, 192] as const;

export type Mp3Bitrate = (typeof MP3_BITRATES)[number];

export type DownloadPreferences = {
  formatPriority: DownloadFormat[];
  /** null = any bitrate */
  minMp3Bitrate: Mp3Bitrate | null;
  autoDownload: boolean;
};

export const DEFAULT_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  formatPriority: ['flac', 'mp3'],
  minMp3Bitrate: 320,
  autoDownload: true,
};
