'use client';

import { RotateCcw } from 'lucide-react';
import { DownloadReview } from './download-review';
import type { Candidate, Item } from '@/lib/soulseek/types';

const PILL =
  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs';

const STYLES: Record<string, string> = {
  queued: 'border-gray-200 bg-gray-50 text-gray-500',
  searching: 'border-gray-200 bg-gray-50 text-gray-600',
  matched: 'border-orange-300 bg-white text-orange-700',
  downloading: 'border-orange-400 bg-white text-orange-700',
  review: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
  not_found: 'border-red-200 bg-red-50 text-red-700',
  failed: 'border-red-300 bg-red-50 text-red-700',
  skipped: 'border-gray-200 bg-gray-50 text-gray-400',
};

function label(item: Item): string {
  switch (item.status) {
    case 'queued':
      return 'Queued';
    case 'searching':
      return 'Searching';
    case 'matched':
      return 'Matched';
    case 'downloading':
      return `Downloading ${Math.round((item.progress ?? 0) * 100)}%`;
    case 'review':
      return 'Review';
    case 'not_found':
      return 'Not found';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return item.status;
  }
}

/** The in-flight badge that replaces the download icon on a track row. */
export function DownloadStatus({
  item,
  onChoose,
  onSkip,
  onRetry,
}: {
  item: Item;
  onChoose?: (candidate: Candidate) => void;
  onSkip?: () => void;
  onRetry?: () => void;
}) {
  const classes = `${PILL} ${STYLES[item.status] ?? STYLES.queued}`;

  if (item.status === 'review' && onChoose && onSkip) {
    return (
      <DownloadReview item={item} onChoose={onChoose} onSkip={onSkip}>
        <button
          type="button"
          title={`${item.candidates.length} candidate${
            item.candidates.length === 1 ? '' : 's'
          } to review`}
          className={`${classes} cursor-pointer`}
        >
          Review
        </button>
      </DownloadReview>
    );
  }

  const canRetry =
    (item.status === 'not_found' || item.status === 'failed') && onRetry;

  return (
    <span
      className={classes}
      title={item.status === 'failed' ? item.error ?? undefined : undefined}
    >
      {label(item)}
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          title="Search again with a broader query"
          className="-mr-1 rounded-full p-0.5 hover:bg-red-100"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="sr-only">Retry</span>
        </button>
      )}
    </span>
  );
}
