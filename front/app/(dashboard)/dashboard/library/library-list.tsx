'use client';

import ListTracks from '@/components/ListTracks';
import { useTrackList } from '@/lib/tracks/use-track-list';
import type { Track } from '@/lib/db/schema';

export function LibraryList({ initialTracks }: { initialTracks: Track[] }) {
  const { tracks, deleteTrack } = useTrackList(initialTracks);

  return <ListTracks tracks={tracks} deleteTrack={deleteTrack} />;
}
