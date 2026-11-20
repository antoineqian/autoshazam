import type { TrackWithSource } from '@/lib/db/schema';

export type ViewMode = 'by-source' | 'all-tracks';
export type SourceSort = 'newest' | 'oldest' | 'name';
export type TrackSort = 'recent' | 'title' | 'artist' | 'sources';

export type SourceGroup = {
  key: string;
  sourceId: number | null;
  label: string;
  kind: string;
  url: string | null;
  intervalMinutes: number | null;
  createdAt: Date | null;
  tracks: TrackWithSource[];
};

export type UniqueTrack = TrackWithSource & {
  sourceLabels: string[];
};

export const identity = (track: { title: string; subtitle: string }) =>
  `${track.title} ${track.subtitle}`.toLowerCase();

/**
 * Sampling a mix repeatedly detects the same track at consecutive points, so a
 * track shows once per run, at the earliest position it was heard.
 */
function collapseDetections(tracks: TrackWithSource[]): TrackWithSource[] {
  const earliest = new Map<string, TrackWithSource>();

  for (const track of tracks) {
    const key = identity(track);
    const seen = earliest.get(key);
    if (!seen || (track.position ?? Infinity) < (seen.position ?? Infinity)) {
      earliest.set(key, track);
    }
  }

  return [...earliest.values()];
}

export function matchesQuery(track: TrackWithSource, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return (
    track.title.toLowerCase().includes(q) ||
    track.subtitle.toLowerCase().includes(q) ||
    (track.source?.label ?? '').toLowerCase().includes(q)
  );
}

/** Which runs each track turns up in, keyed by title and artist. */
export function countSourcesPerTrack(
  tracks: TrackWithSource[]
): Map<string, string[]> {
  const labels = new Map<string, Set<string>>();

  for (const track of tracks) {
    const key = identity(track);
    const label = track.source?.label ?? 'No source';
    const set = labels.get(key) ?? new Set<string>();
    set.add(label);
    labels.set(key, set);
  }

  return new Map([...labels].map(([key, set]) => [key, [...set]]));
}

export function groupBySource(
  tracks: TrackWithSource[],
  sort: SourceSort
): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();

  for (const track of tracks) {
    const key = track.sourceId === null ? 'none' : String(track.sourceId);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        sourceId: track.sourceId,
        label: track.source?.label ?? 'No source',
        kind: track.source?.kind ?? 'unknown',
        url: track.source?.url ?? null,
        intervalMinutes: track.source?.intervalMinutes ?? null,
        createdAt: track.source?.createdAt ?? track.createdAt ?? null,
        tracks: [],
      };
      groups.set(key, group);
    }

    group.tracks.push(track);
  }

  const collapsed = [...groups.values()].map((group) => ({
    ...group,
    tracks:
      group.kind === 'manual'
        ? [...group.tracks].sort(
            (a, b) => (a.tracklistOrder ?? a.id) - (b.tracklistOrder ?? b.id)
          )
        : collapseDetections(group.tracks).sort(
            (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)
          ),
  }));

  const time = (group: SourceGroup) => group.createdAt?.getTime() ?? 0;

  return collapsed.sort((a, b) => {
    if (sort === 'name') {
      return a.label.localeCompare(b.label);
    }
    return sort === 'oldest' ? time(a) - time(b) : time(b) - time(a);
  });
}

export function flattenUnique(
  tracks: TrackWithSource[],
  sort: TrackSort,
  sourceLabels: Map<string, string[]>
): UniqueTrack[] {
  const unique = collapseDetections(tracks).map((track) => ({
    ...track,
    sourceLabels: sourceLabels.get(identity(track)) ?? [],
  }));

  return unique.sort((a, b) => {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'artist':
        return a.subtitle.localeCompare(b.subtitle);
      case 'sources':
        return (
          b.sourceLabels.length - a.sourceLabels.length ||
          a.title.localeCompare(b.title)
        );
      default:
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    }
  });
}

export function formatPosition(minutes: number | null): string {
  if (minutes === null) return '';
  const total = Math.max(0, Math.round(minutes * 60));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, '0');

  return hours > 0
    ? `${hours}:${String(mins).padStart(2, '0')}:${seconds}`
    : `${mins}:${seconds}`;
}

export function formatTrackName(track: {
  title: string;
  subtitle: string;
}): string {
  return track.subtitle ? `${track.subtitle} - ${track.title}` : track.title;
}

export function formatTracklistLine(track: {
  title: string;
  subtitle: string;
  position: number | null;
}): string {
  const timestamp = formatPosition(track.position);
  return `${timestamp ? `${timestamp}  ` : ''}${formatTrackName(track)}`;
}

export function formatRunDate(date: Date | null): string {
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
