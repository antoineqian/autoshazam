'use client';

import { useState } from 'react';
import {
  ChevronRight,
  CloudDownload,
  Download,
  FileAudio,
  Link2,
  HelpCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import { TrackRow } from './track-row';
import { formatRunDate } from '@/lib/tracks/library-model';
import type { SourceGroup as SourceGroupModel } from '@/lib/tracks/library-model';
import type { TrackWithSource } from '@/lib/db/schema';
import type { Candidate } from '@/lib/soulseek/types';
import type { ItemWithJob } from '@/lib/soulseek/use-soulseek-jobs';

const KIND_ICON = {
  file: FileAudio,
  url: Link2,
  unknown: HelpCircle,
} as const;

/** Soulseek controls for the rows, absent when the backend has no account. */
export type RowDownloads = {
  itemFor: (track: {
    title: string;
    subtitle: string;
  }) => ItemWithJob | undefined;
  start: (track: TrackWithSource, sourceLabel: string) => void;
  choose: (item: ItemWithJob, candidate: Candidate) => void;
  skip: (item: ItemWithJob) => void;
  retry: (item: ItemWithJob) => void;
};

export function SourceGroup({
  group,
  expanded,
  onToggle,
  onDeleteTrack,
  onToggleDownloaded,
  onDeleteSource,
  onRenameSource,
  onExport,
  sourceLabelsFor,
  downloads,
  missingCount = 0,
  onDownloadMissing,
}: {
  group: SourceGroupModel;
  expanded: boolean;
  onToggle: () => void;
  sourceLabelsFor: (track: { title: string; subtitle: string }) => string[];
  onDeleteTrack: (id: number) => void;
  onToggleDownloaded: (id: number, downloaded: boolean) => void;
  onDeleteSource: (id: number) => void;
  onRenameSource: (id: number, label: string) => void;
  onExport: (group: SourceGroupModel) => void;
  downloads?: RowDownloads;
  missingCount?: number;
  onDownloadMissing?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.label);

  const Icon = KIND_ICON[group.kind as keyof typeof KIND_ICON] ?? HelpCircle;
  const date = formatRunDate(group.createdAt);

  const submitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== group.label && group.sourceId !== null) {
      onRenameSource(group.sourceId, trimmed);
    }
    setRenaming(false);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          <Icon className="h-4 w-4 shrink-0 text-gray-500" />

          {renaming ? (
            <input
              autoFocus
              // Renaming almost always means replacing the name, not appending
              // to it - especially for the generated "Unknown source" labels.
              onFocus={(e) => e.target.select()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') {
                  setDraft(group.label);
                  setRenaming(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-orange-400 px-1.5 py-0.5 text-sm"
            />
          ) : (
            <span className="truncate text-sm font-medium text-gray-900">
              {group.label}
            </span>
          )}
        </button>

        <span className="shrink-0 text-xs text-gray-500">
          {date}
          {date && ' · '}
          {group.tracks.length} track{group.tracks.length === 1 ? '' : 's'}
          {group.intervalMinutes ? ` · every ${group.intervalMinutes} min` : ''}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {onDownloadMissing && missingCount > 0 && (
            <button
              type="button"
              onClick={onDownloadMissing}
              title="Download every missing track of this source from Soulseek"
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-white px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
            >
              <CloudDownload className="h-4 w-4" />
              Download missing ({missingCount})
            </button>
          )}

          {group.sourceId !== null && (
            <button
              type="button"
              onClick={() => {
                setDraft(group.label);
                setRenaming(true);
              }}
              title="Rename this source"
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Rename {group.label}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onExport(group)}
            title="Export this tracklist"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Export {group.label}</span>
          </button>

          {group.sourceId !== null && (
            <button
              type="button"
              onClick={() => onDeleteSource(group.sourceId!)}
              title="Delete this source and its tracks"
              className="rounded p-1.5 text-gray-500 hover:bg-red-100 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete {group.label}</span>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <ul className="border-t border-gray-100 p-1.5">
          {group.tracks.map((track) => {
            const item = downloads?.itemFor(track);
            return (
              <TrackRow
                key={track.id}
                track={track}
                sourceLabels={sourceLabelsFor(track)}
                onDelete={onDeleteTrack}
                onToggleDownloaded={onToggleDownloaded}
                deleteTitle="Remove from this source"
                downloadState={item}
                onDownload={
                  downloads ? () => downloads.start(track, group.label) : undefined
                }
                onChoose={
                  downloads && item
                    ? (candidate) => downloads.choose(item, candidate)
                    : undefined
                }
                onSkip={downloads && item ? () => downloads.skip(item) : undefined}
                onRetry={downloads && item ? () => downloads.retry(item) : undefined}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
