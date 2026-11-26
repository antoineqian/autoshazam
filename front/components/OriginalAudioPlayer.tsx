'use client';

import { useRef, useState } from 'react';
import AudioPlayer from './AudioPlayer';
import OriginalAudioRecovery from './OriginalAudioRecovery';
import { ANALYSIS_BACKEND } from '@/lib/analysis/url-analysis';
import { formatPosition } from '@/lib/tracks/library-model';
import { forgetLocalOriginal, originalRecordingKey, selectLocalOriginal, useLocalOriginal } from '@/lib/audio/local-originals';

export default function OriginalAudioPlayer({
  track,
}: {
  track: {
    id: number; title: string; position: number | null; originalClipId?: string | null;
    sourceId?: number | null; fileIndex?: number; source?: { url: string | null } | null;
  };
}) {
  const [restoredClipId, setRestoredClipId] = useState<string | null>(null);
  const autoPlay = useRef(false);
  const recordingKey = originalRecordingKey(track);
  const selectedSource = useLocalOriginal(recordingKey);
  const timed = track.position !== null && Number.isFinite(track.position) && track.position >= 0;
  const localSource = timed ? selectedSource : null;
  const clipId = track.originalClipId ?? restoredClipId;
  const hasClip = clipId && /^[0-9a-f]{32}$/.test(clipId);
  if (!localSource && !hasClip) {
    return (
      <OriginalAudioRecovery track={track}
        onRestored={(id) => { autoPlay.current = true; setRestoredClipId(id); }}
        onFile={(file) => { autoPlay.current = true; selectLocalOriginal(recordingKey, file); }} />
    );
  }

  return (
    <AudioPlayer
      audioSrc={localSource ?? `${ANALYSIS_BACKEND.replace(/\/$/, '')}/original-audio/${clipId}`}
      startTime={localSource ? (track.position ?? 0) * 60 : 0}
      duration={30}
      autoPlay={autoPlay.current}
      errorMessage={localSource ? 'Could not play this file at the saved timestamp. Choose the original recording in a format your browser supports.' : ''}
      onError={() => { if (localSource) forgetLocalOriginal(recordingKey); }}
      label={`original audio for ${track.title} at ${formatPosition(track.position)} (up to 30 seconds)`}
      original
    />
  );
}
