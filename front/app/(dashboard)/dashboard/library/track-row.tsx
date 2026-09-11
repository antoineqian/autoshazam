'use client';

import copy from 'clipboard-copy';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import AudioPlayer from '@/components/AudioPlayer';
import { DownloadStatus } from './download-status';
import { formatPosition } from '@/lib/tracks/library-model';
import type { TrackWithSource } from '@/lib/db/schema';
import type { Candidate, Item } from '@/lib/soulseek/types';

export function TrackRow({
  track,
  sourceLabels,
  onDelete,
  onToggleDownloaded,
  deleteTitle,
  downloadState,
  onDownload,
  onChoose,
  onSkip,
  onRetry,
}: {
  track: TrackWithSource;
  sourceLabels?: string[];
  onDelete: (id: number) => void;
  onToggleDownloaded: (id: number, downloaded: boolean) => void;
  deleteTitle: string;
  /** Soulseek item for this track, when a job has been started for it. */
  downloadState?: Item;
  onDownload?: () => void;
  onChoose?: (candidate: Candidate) => void;
  onSkip?: () => void;
  onRetry?: () => void;
}) {
  const copyToClipboard = () => {
    copy(`${track.subtitle} ${track.title}`);
    toast('Copied to clipboard');
  };

  // Done flips the checkbox and the badge goes away; a skipped track is back
  // to square one and can be requested again.
  const showBadge =
    downloadState &&
    downloadState.status !== 'done' &&
    downloadState.status !== 'skipped';
  const showDownload = !track.downloaded && onDownload && !showBadge;

  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 group">
      <input
        type="checkbox"
        // Always a boolean so the input stays controlled: client state can
        // briefly hold tracks that predate the flag (e.g. across a hot reload).
        checked={Boolean(track.downloaded)}
        onChange={(e) => onToggleDownloaded(track.id, e.target.checked)}
        title={
          track.downloaded
            ? 'In your collection - click to unmark'
            : 'Mark as downloaded'
        }
        aria-label={`Mark ${track.subtitle} - ${track.title} as downloaded`}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-orange-500 focus:ring-orange-500"
      />

      <span className="w-16 shrink-0 text-xs tabular-nums text-gray-500">
        {formatPosition(track.position)}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            track.downloaded ? 'text-gray-400' : 'text-gray-900'
          }`}
        >
          {track.title}
        </p>
        <p
          className={`truncate text-xs ${
            track.downloaded ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {track.subtitle}
        </p>
      </div>

      {sourceLabels && sourceLabels.length > 1 && (
        <span
          className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
          title={sourceLabels.join('\n')}
        >
          {sourceLabels.length} sources
        </span>
      )}

      {showBadge && (
        <DownloadStatus
          item={downloadState}
          onChoose={onChoose}
          onSkip={onSkip}
          onRetry={onRetry}
        />
      )}

      <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {track.uri && <AudioPlayer audioSrc={track.uri} />}

        {track.url && (
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Shazam"
            className="rounded p-1.5 hover:bg-gray-200"
          >
            <img src="/shazam.svg" alt="" className="h-4 w-4" />
            <span className="sr-only">Open {track.title} in Shazam</span>
          </a>
        )}

        <button
          type="button"
          onClick={copyToClipboard}
          title="Copy artist and title"
          className="rounded p-1.5 hover:bg-gray-200"
        >
          <img src="/copy.svg" alt="" className="h-4 w-4" />
          <span className="sr-only">Copy {track.title}</span>
        </button>

        {showDownload && (
          <button
            type="button"
            onClick={onDownload}
            title="Download from Soulseek"
            className="rounded p-1.5 text-gray-600 hover:bg-orange-100 hover:text-orange-700"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Download {track.title} from Soulseek</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(track.id)}
          title={deleteTitle}
          className="rounded p-1.5 hover:bg-red-100"
        >
          <img src="/delete.svg" alt="" className="h-4 w-4" />
          <span className="sr-only">
            {deleteTitle}: {track.title}
          </span>
        </button>
      </div>
    </li>
  );
}
