'use client';

import { useState } from 'react';
import AudioPlayer from './AudioPlayer';
import OriginalAudioRecovery from './OriginalAudioRecovery';
import { ANALYSIS_BACKEND } from '@/lib/analysis/url-analysis';
import { formatPosition } from '@/lib/tracks/library-model';

export default function OriginalAudioPlayer({
  track,
}: {
  track: { id: number; title: string; position: number | null; originalClipId?: string | null };
}) {
  const [restoredClipId, setRestoredClipId] = useState<string | null>(null);
  const clipId = track.originalClipId ?? restoredClipId;
  if (!clipId || !/^[0-9a-f]{32}$/.test(clipId)) {
    return (
      <OriginalAudioRecovery track={track} onRestored={setRestoredClipId} />
    );
  }

  return (
    <AudioPlayer
      audioSrc={`${ANALYSIS_BACKEND.replace(/\/$/, '')}/original-audio/${clipId}`}
      label={`original audio for ${track.title} at ${formatPosition(track.position)} (up to 30 seconds)`}
      original
    />
  );
}
