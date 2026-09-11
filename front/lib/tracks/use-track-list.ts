'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { deleteTrackAction } from './actions';
import type { Track } from '@/lib/db/schema';

/**
 * Track list state shared by the analysis page and the library, so both delete
 * through the same path and stay consistent with each other.
 */
export function useTrackList(initialTracks: Track[] = []) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);

  const deleteTrack = async (id: number) => {
    const previousTracks = tracks;
    const target = previousTracks.find((track) => track.id === id);
    if (!target) {
      return;
    }

    // Matches what deleteTrackAction removes on the server: every detection of
    // this track, not just the row whose id was clicked. Filtering by id alone
    // would leave the duplicates behind and the row would redraw unchanged.
    setTracks((prevTracks) =>
      prevTracks.filter(
        (track) =>
          track.title !== target.title || track.subtitle !== target.subtitle
      )
    );

    try {
      await deleteTrackAction(id);
    } catch (err) {
      console.error('Failed to delete track', err);
      setTracks(previousTracks);
      toast.error('Failed to delete track, please try again');
    }
  };

  return { tracks, setTracks, deleteTrack };
}
