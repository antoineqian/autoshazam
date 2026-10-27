'use client';

import React, { useRef, useState } from 'react';
import ListTracks from '@/components/ListTracks';
import FileUploadForm from '@/components/FileUploadForm';
import {
  createSourceAction,
  saveAnalysisAction,
  saveTrackAction,
} from '@/lib/tracks/actions';
import { useTrackList } from '@/lib/tracks/use-track-list';
import type { Source } from '@/lib/db/schema';
import type { AnalysisRecord } from '@/lib/analysis/url-analysis';

export default function DrillAnalyzer() {
  const { tracks, setTracks, deleteTrack } = useTrackList();
  const [busy, setBusy] = useState(false);
  // URL mode streams tracks in one at a time after announcing its source, so
  // hold the in-flight creation and let each track await the same promise
  // rather than racing to create a run of its own.
  const pendingSource = useRef<Promise<Source> | null>(null);

  // Called for each websocket message in URL mode: first the source, then tracks.
  const addTrack = async (parsed: AnalysisRecord): Promise<void> => {
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

    const source = await pendingSource.current;
    if (!source) throw new Error('The analysis source was not saved.');
    const saved = await saveTrackAction({ ...parsed, sourceId: source.id });
    setTracks((prevTracks) => [...prevTracks, saved]);
  };

  // Called once with the full batch of detected tracks (file/folder mode). One
  // uploaded file is one run, so the batch is split back up by filename.
  const onFolderResults = async (rawTracks: any[]): Promise<number> => {
    const byFile = new Map<string, any[]>();
    for (const track of rawTracks) {
      const label = track.sourceLabel ?? 'Uploaded audio';
      byFile.set(label, [...(byFile.get(label) ?? []), track]);
    }

    const runs = await Promise.all(
      [...byFile].map(([label, fileTracks]) =>
        saveAnalysisAction({
          source: {
            kind: fileTracks[0]?.sourceKind ?? 'file',
            label,
            intervalMinutes: fileTracks[0]?.intervalMinutes,
          },
          tracks: fileTracks,
        }),
      ),
    );
    setTracks(runs.flatMap((run) => run.tracks));
    return runs.reduce((count, run) => count + run.tracks.length, 0);
  };

  const reset = () => {
    pendingSource.current = null;
    setTracks([]);
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            Analysis
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Dig into a mix. Find the tracks worth keeping.
          </p>
        </header>
        <FileUploadForm
          onRecord={addTrack}
          onResults={onFolderResults}
          onStart={reset}
          onBusyChange={setBusy}
        />
        <ListTracks
          tracks={tracks}
          deleteTrack={deleteTrack}
          reset={reset}
          busy={busy}
        />
      </div>
    </section>
  );
}
