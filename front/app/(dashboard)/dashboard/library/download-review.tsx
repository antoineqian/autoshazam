'use client';

import type { ReactNode } from 'react';
import { Download, SkipForward } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Candidate, Item } from '@/lib/soulseek/types';

/** Mirrors clean() in the backend's matching.py, for display only. */
function cleanFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{1,3}[\s._-]+/, '')
    .trim();
}

function formatQuality(candidate: Candidate): string {
  const ext = candidate.extension.toUpperCase();
  if (candidate.extension === 'mp3' && candidate.bitrate) {
    return `${ext} ${candidate.bitrate}${candidate.vbr ? ' VBR' : ''}`;
  }
  return ext;
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function DownloadReview({
  item,
  onChoose,
  onSkip,
  children,
}: {
  item: Item;
  onChoose: (candidate: Candidate) => void;
  onSkip: () => void;
  /** The trigger, i.e. the Review pill. */
  children: ReactNode;
}) {
  const candidates = item.candidates.slice(0, 3);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 border-gray-200 bg-white">
        <DropdownMenuLabel className="text-xs font-medium text-gray-500">
          Pick a file for {item.subtitle} - {item.title}
        </DropdownMenuLabel>

        {candidates.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-gray-500">
            No candidates to choose from.
          </p>
        )}

        {candidates.map((candidate) => (
          <DropdownMenuItem
            key={`${candidate.username}:${candidate.remotePath}`}
            onSelect={() => onChoose(candidate)}
            className="flex cursor-pointer items-start gap-3 py-2 focus:bg-orange-50"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono font-medium text-gray-800">
                  {formatQuality(candidate)}
                </span>
                <span>{formatSize(candidate.filesize)}</span>
                <span className="truncate" title={candidate.username}>
                  {candidate.username}
                </span>
                <span
                  className={
                    candidate.hasFreeSlots ? 'text-green-700' : 'text-gray-500'
                  }
                >
                  {candidate.hasFreeSlots
                    ? 'free slot'
                    : `queue ${candidate.queueSize}`}
                </span>
              </div>
              <p
                className="truncate text-sm text-gray-900"
                title={candidate.remotePath}
              >
                {cleanFilename(candidate.filename)}
              </p>
              <p className="text-xs text-gray-500">
                match {Math.round(candidate.matchScore)}
              </p>
            </div>

            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500 px-2 py-1 text-xs font-medium text-white">
              <Download className="h-3 w-3" />
              Download this
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="bg-gray-100" />

        <DropdownMenuItem
          onSelect={onSkip}
          className="cursor-pointer text-sm text-gray-600 focus:bg-gray-100"
        >
          <SkipForward className="h-4 w-4" />
          Skip this track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
