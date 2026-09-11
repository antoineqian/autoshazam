'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, X } from 'lucide-react';
import { SourceGroup } from './source-group';
import type { RowDownloads } from './source-group';
import { TrackRow } from './track-row';
import {
  countSourcesPerTrack,
  flattenUnique,
  groupBySource,
  matchesQuery,
  formatPosition,
} from '@/lib/tracks/library-model';
import type {
  SourceGroup as SourceGroupModel,
  SourceSort,
  TrackSort,
  ViewMode,
} from '@/lib/tracks/library-model';
import {
  deleteSourceAction,
  deleteTrackAction,
  deleteTrackEverywhereAction,
  renameSourceAction,
  setTrackDownloadedAction,
} from '@/lib/tracks/actions';
import type { TrackWithSource } from '@/lib/db/schema';
import { useSoulseekJobs } from '@/lib/soulseek/use-soulseek-jobs';
import { isActive } from '@/lib/soulseek/types';
import type { Item } from '@/lib/soulseek/types';
import type { DownloadPreferences } from '@/lib/soulseek/preferences';

const SOURCE_SORTS: { value: SourceSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
];

type DownloadFilter = 'all' | 'missing' | 'downloaded';

const DOWNLOAD_FILTERS: { value: DownloadFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'missing', label: 'Not downloaded' },
  { value: 'downloaded', label: 'Downloaded' },
];

const TRACK_SORTS: { value: TrackSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'sources', label: 'Most sources' },
];

function downloadTracklist(filename: string, lines: string[]) {
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LibraryView({
  initialTracks,
  initialPreferences,
}: {
  initialTracks: TrackWithSource[];
  initialPreferences: DownloadPreferences;
}) {
  const [tracks, setTracks] = useState(initialTracks);
  const [view, setView] = useState<ViewMode>('by-source');
  const [query, setQuery] = useState('');
  const [sourceSort, setSourceSort] = useState<SourceSort>('newest');
  const [trackSort, setTrackSort] = useState<TrackSort>('recent');
  const [downloadFilter, setDownloadFilter] = useState<DownloadFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Server state can change under us (a new analysis, another team member), so
  // re-sync when the server component sends a fresh list down.
  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A finished Soulseek download is already recorded server-side by the hook;
  // this only mirrors it locally, like toggleDownloaded does for the checkbox.
  const markDownloaded = useCallback((item: Item) => {
    setTracks((current) =>
      current.map((track) =>
        track.title === item.title && track.subtitle === item.subtitle
          ? { ...track, downloaded: true }
          : track
      )
    );
  }, []);

  const soulseek = useSoulseekJobs({ onDownloaded: markDownloaded });
  const soulseekReady = soulseek.status?.configured === true;

  const sourceLabels = useMemo(() => countSourcesPerTrack(tracks), [tracks]);

  const visible = useMemo(() => {
    return tracks.filter((track) => {
      if (!matchesQuery(track, query)) {
        return false;
      }
      if (downloadFilter === 'missing') {
        return !track.downloaded;
      }
      if (downloadFilter === 'downloaded') {
        return track.downloaded;
      }
      return true;
    });
  }, [tracks, query, downloadFilter]);

  const groups = useMemo(
    () => groupBySource(visible, sourceSort),
    [visible, sourceSort]
  );

  const flat = useMemo(
    () => flattenUnique(visible, trackSort, sourceLabels),
    [visible, trackSort, sourceLabels]
  );

  const totalRuns = useMemo(
    () => new Set(tracks.map((track) => track.sourceId ?? 'none')).size,
    [tracks]
  );

  const totalTracks = useMemo(
    () =>
      new Set(
        tracks.map((track) =>
          `${track.title} ${track.subtitle}`.toLowerCase()
        )
      ).size,
    [tracks]
  );

  const downloadedTracks = useMemo(
    () =>
      new Set(
        tracks
          .filter((track) => track.downloaded)
          .map((track) => `${track.title} ${track.subtitle}`.toLowerCase())
      ).size,
    [tracks]
  );

  const withRollback = async (
    optimistic: (current: TrackWithSource[]) => TrackWithSource[],
    action: () => Promise<unknown>,
    failureMessage: string
  ) => {
    const previous = tracks;
    setTracks(optimistic(previous));
    try {
      await action();
    } catch (err) {
      console.error(failureMessage, err);
      setTracks(previous);
      toast.error(failureMessage);
    }
  };

  const deleteFromSource = (id: number) => {
    const target = tracks.find((track) => track.id === id);
    if (!target) return;

    return withRollback(
      (current) =>
        current.filter(
          (track) =>
            track.sourceId !== target.sourceId ||
            track.title !== target.title ||
            track.subtitle !== target.subtitle
        ),
      () => deleteTrackAction(id),
      'Could not remove that track, please try again'
    );
  };

  const deleteEverywhere = (id: number) => {
    const target = tracks.find((track) => track.id === id);
    if (!target) return;

    return withRollback(
      (current) =>
        current.filter(
          (track) =>
            track.title !== target.title || track.subtitle !== target.subtitle
        ),
      () => deleteTrackEverywhereAction(id),
      'Could not remove that track, please try again'
    );
  };

  const toggleDownloaded = (id: number, downloaded: boolean) => {
    const target = tracks.find((track) => track.id === id);
    if (!target) return;

    return withRollback(
      (current) =>
        current.map((track) =>
          track.title === target.title && track.subtitle === target.subtitle
            ? { ...track, downloaded }
            : track
        ),
      () => setTrackDownloadedAction(id, downloaded),
      'Could not update that track, please try again'
    );
  };

  const deleteSource = (sourceId: number) => {
    const group = groups.find((item) => item.sourceId === sourceId);
    const name = group?.label ?? 'this source';
    if (!window.confirm(`Delete "${name}" and all of its tracks?`)) {
      return;
    }

    return withRollback(
      (current) => current.filter((track) => track.sourceId !== sourceId),
      () => deleteSourceAction(sourceId),
      'Could not delete that source, please try again'
    );
  };

  const renameSource = (sourceId: number, label: string) =>
    withRollback(
      (current) =>
        current.map((track) =>
          track.sourceId === sourceId && track.source
            ? { ...track, source: { ...track.source, label } }
            : track
        ),
      () => renameSourceAction(sourceId, label),
      'Could not rename that source, please try again'
    );

  const exportGroup = (group: SourceGroupModel) => {
    downloadTracklist(
      `${group.label.replace(/[^\w.-]+/g, '_')}.txt`,
      group.tracks.map(
        (track) =>
          `${formatPosition(track.position)}  ${track.subtitle} - ${track.title}`
      )
    );
  };

  const exportAll = () => {
    downloadTracklist(
      'library.txt',
      flat.map((track) => `${track.subtitle} - ${track.title}`)
    );
  };

  const toggleGroup = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const sourceLabelsFor = (track: { title: string; subtitle: string }) =>
    sourceLabels.get(`${track.title} ${track.subtitle}`.toLowerCase()) ?? [];

  const rowDownloads: RowDownloads | undefined = soulseekReady
    ? {
        itemFor: soulseek.itemFor,
        start: (track, sourceLabel) =>
          soulseek.startDownload(
            [
              {
                title: track.title,
                subtitle: track.subtitle,
                sourceLabel,
                sourceId: track.sourceId,
              },
            ],
            initialPreferences
          ),
        choose: soulseek.choose,
        skip: soulseek.skip,
        retry: soulseek.retry,
      }
    : undefined;

  /** Tracks of a group that still need a file and have no job in flight. */
  const missingIn = (group: SourceGroupModel) =>
    group.tracks.filter((track) => {
      if (track.downloaded) return false;
      const item = soulseek.itemFor(track);
      return !item || !isActive(item.status);
    });

  const downloadMissing = (group: SourceGroupModel) =>
    soulseek.startDownload(
      missingIn(group).map((track) => ({
        title: track.title,
        subtitle: track.subtitle,
        sourceLabel: group.label,
        sourceId: track.sourceId,
      })),
      initialPreferences
    );

  const allCollapsed = groups.length > 0 && collapsed.size >= groups.length;

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm font-medium text-gray-900">
          Nothing in your library yet
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Analyse a mix and the tracks it finds will be collected here.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Analyse something
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-3 bg-gray-50 px-1 pb-3 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search tracks, artists, sources…"
            aria-label="Search the library"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-16 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-300 px-1.5 text-xs text-gray-400">
              /
            </kbd>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
            {(
              [
                ['by-source', 'By source'],
                ['all-tracks', 'All tracks'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={`rounded px-3 py-1 text-sm ${
                  view === value
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="sr-only">Sort by</span>
            {view === 'by-source' ? (
              <select
                value={sourceSort}
                onChange={(e) => setSourceSort(e.target.value as SourceSort)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                {SOURCE_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={trackSort}
                onChange={(e) => setTrackSort(e.target.value as TrackSort)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                {TRACK_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="sr-only">Filter by download status</span>
            <select
              value={downloadFilter}
              onChange={(e) =>
                setDownloadFilter(e.target.value as DownloadFilter)
              }
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {DOWNLOAD_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {view === 'by-source' && groups.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setCollapsed(
                  allCollapsed
                    ? new Set()
                    : new Set(groups.map((group) => group.key))
                )
              }
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}

          <button
            type="button"
            onClick={exportAll}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Export
          </button>

          <p className="ml-auto text-sm text-gray-500">
            <span className="font-medium text-gray-900">
              {downloadedTracks}/{totalTracks}
            </span>{' '}
            downloaded · {totalRuns} source{totalRuns === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm font-medium text-gray-900">
            Nothing matches {query ? `“${query}”` : 'those filters'}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setDownloadFilter('all');
            }}
            className="mt-3 text-sm font-medium text-orange-600 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : view === 'by-source' ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <SourceGroup
              key={group.key}
              group={group}
              expanded={!collapsed.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
              onDeleteTrack={deleteFromSource}
              onToggleDownloaded={toggleDownloaded}
              onDeleteSource={deleteSource}
              onRenameSource={renameSource}
              onExport={exportGroup}
              sourceLabelsFor={sourceLabelsFor}
              downloads={rowDownloads}
              missingCount={soulseekReady ? missingIn(group).length : 0}
              onDownloadMissing={
                soulseekReady ? () => downloadMissing(group) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <ul className="rounded-lg border border-gray-200 bg-white p-1.5">
          {flat.map((track) => {
            const item = rowDownloads?.itemFor(track);
            return (
              <TrackRow
                key={track.id}
                track={track}
                sourceLabels={track.sourceLabels}
                onDelete={deleteEverywhere}
                onToggleDownloaded={toggleDownloaded}
                deleteTitle="Remove from every source"
                downloadState={item}
                onDownload={
                  rowDownloads
                    ? () =>
                        rowDownloads.start(
                          track,
                          track.sourceLabels[0] ?? 'Unknown source'
                        )
                    : undefined
                }
                onChoose={
                  rowDownloads && item
                    ? (candidate) => rowDownloads.choose(item, candidate)
                    : undefined
                }
                onSkip={
                  rowDownloads && item ? () => rowDownloads.skip(item) : undefined
                }
                onRetry={
                  rowDownloads && item ? () => rowDownloads.retry(item) : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
