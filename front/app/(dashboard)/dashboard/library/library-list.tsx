'use client';

import { useState } from 'react';
import ListTracks from '@/components/ListTracks';
import { deleteTrackAction } from '@/lib/tracks/actions';
import type { Track } from '@/lib/db/schema';

export function LibraryList({ initialTracks }: { initialTracks: Track[] }) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);

  const deleteTrack = async (id: number) => {
    setTracks((prevTracks) => prevTracks.filter((track) => track.id !== id));
    try {
      await deleteTrackAction(id);
    } catch (err) {
      console.error('Failed to delete track', err);
    }
  };

  return <ListTracks tracks={tracks} deleteTrack={deleteTrack} />;
}
