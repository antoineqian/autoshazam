'use client';

import React, { useRef } from "react";
import ListTracks from "@/components/ListTracks";
import FileUploadForm from "@/components/FileUploadForm";
import { createSourceAction, saveAnalysisAction, saveTrackAction } from "@/lib/tracks/actions";
import { useTrackList } from "@/lib/tracks/use-track-list";
import type { Source } from "@/lib/db/schema";

export default function DrillAnalyzer() {
  const { tracks, setTracks, deleteTrack } = useTrackList();
  // URL mode streams tracks in one at a time after announcing its source, so
  // hold the in-flight creation and let each track await the same promise
  // rather than racing to create a run of its own.
  const pendingSource = useRef<Promise<Source> | null>(null);

  // Called for each websocket message in URL mode: first the source, then tracks.
  const addTrack = async (rawMessage: string): Promise<void> => {
    const parsed = JSON.parse(rawMessage);

    if (parsed?.type === 'source') {
      pendingSource.current = createSourceAction({
        kind: parsed.kind ?? 'url',
        label: parsed.label,
        url: parsed.url,
        intervalMinutes: parsed.intervalMinutes,
      });
      await pendingSource.current;
      return;
    }

    try {
      const source = await pendingSource.current;
      const saved = await saveTrackAction({ ...parsed, sourceId: source?.id });
      setTracks((prevTracks) => [...prevTracks, saved]);
    } catch (err) {
      console.error('Failed to save track', err);
    }
  };

  // Called once with the full batch of detected tracks (file/folder mode). One
  // uploaded file is one run, so the batch is split back up by filename.
  const onFolderResults = async (rawTracks: any[]): Promise<void> => {
    const byFile = new Map<string, any[]>();
    for (const track of rawTracks) {
      const label = track.sourceLabel ?? 'Uploaded audio';
      byFile.set(label, [...(byFile.get(label) ?? []), track]);
    }

    try {
      const runs = await Promise.all(
        [...byFile].map(([label, fileTracks]) =>
          saveAnalysisAction({
            source: {
              kind: fileTracks[0]?.sourceKind ?? 'file',
              label,
              intervalMinutes: fileTracks[0]?.intervalMinutes,
            },
            tracks: fileTracks,
          })
        )
      );
      setTracks(runs.flatMap((run) => run.tracks));
    } catch (err) {
      console.error('Failed to save tracks', err);
    }
  };

  const reset = () => {
    pendingSource.current = null;
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
