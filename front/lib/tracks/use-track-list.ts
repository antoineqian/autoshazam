'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { deleteTrackAction } from './actions';
import type { Track } from '@/lib/db/schema';

/**
 * Track list state for the analysis page. Everything here belongs to the run
 * currently being analysed, so deleting matches the server's per-run rule.
 */
export function useTrackList(initialTracks: Track[] = []) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);

  const deleteTrack = async (id: number) => {
    const previousTracks = tracks;
    const target = previousTracks.find((track) => track.id === id);
    if (!target) {
      return;
    }

    // Mirrors deleteTrackAction: every detection of this track within the same
    // run goes. Filtering by id alone would leave the other detections behind
    // and the collapsed row would redraw unchanged.
    setTracks((prevTracks) =>
      prevTracks.filter(
        (track) =>
          track.sourceId !== target.sourceId ||
          track.title !== target.title ||
          track.subtitle !== target.subtitle
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
