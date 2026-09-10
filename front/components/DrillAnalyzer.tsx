'use client';

import React, { useState } from "react";
import toast from "react-hot-toast";
import ListTracks from "@/components/ListTracks";
import FileUploadForm from "@/components/FileUploadForm";
import { saveTrackAction, deleteTrackAction } from "@/lib/tracks/actions";
import type { Track } from "@/lib/db/schema";

export default function DrillAnalyzer() {
  const [tracks, setTracks] = useState<Track[]>([]);

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

  // Called as each track is detected over the websocket (URL mode).
  const addTrack = async (rawTrack: string): Promise<void> => {
    const parsed = JSON.parse(rawTrack);
    try {
      const saved = await saveTrackAction(parsed);
      setTracks((prevTracks) => [...prevTracks, saved]);
    } catch (err) {
      console.error('Failed to save track', err);
    }
  };

  // Called once with the full batch of detected tracks (file/folder mode).
  const onFolderResults = async (rawTracks: any[]): Promise<void> => {
    try {
      const saved = await Promise.all(rawTracks.map(saveTrackAction));
      setTracks(saved);
    } catch (err) {
      console.error('Failed to save tracks', err);
    }
  };

  const reset = () => {
    setTracks([]);
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
          Let's dig !
        </h1>
        <FileUploadForm addTrack={addTrack} onResults={onFolderResults} />
        <ListTracks tracks={tracks} deleteTrack={deleteTrack} reset={reset} />
      </div>
    </section>
  );
}
