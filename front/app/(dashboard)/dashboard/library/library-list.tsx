'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import ListTracks from '@/components/ListTracks';
import { deleteTrackAction } from '@/lib/tracks/actions';
import type { Track } from '@/lib/db/schema';

export function LibraryList({ initialTracks }: { initialTracks: Track[] }) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);

  const deleteTrack = async (id: number) => {
    const previousTracks = tracks;
    setTracks((prevTracks) => prevTracks.filter((track) => track.id !== id));
    try {
      await deleteTrackAction(id);
    } catch (err) {
      console.error('Failed to delete track', err);
      setTracks(previousTracks);
      toast.error('Failed to delete track, please try again');
    }
  };

  return <ListTracks tracks={tracks} deleteTrack={deleteTrack} />;
}
