'use client';

import { FileAudio } from 'lucide-react';
import AudioPlayer from './AudioPlayer';
import { ANALYSIS_BACKEND } from '@/lib/analysis/url-analysis';
import { formatPosition } from '@/lib/tracks/library-model';

export default function OriginalAudioPlayer({
  track,
}: {
  track: { title: string; position: number | null; originalClipId?: string | null };
}) {
  if (!track.originalClipId || !/^[0-9a-f]{32}$/.test(track.originalClipId)) {
    return (
      <span title="No original audio was saved for this track. Analyze the original file or URL again to enable playback.">
        <button
          type="button"
          disabled
          aria-label={`Original audio unavailable for ${track.title}`}
          className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-300 disabled:cursor-not-allowed"
        >
          <FileAudio aria-hidden="true" className="h-4 w-4" />
          Original
        </button>
      </span>
    );
  }

  return (
    <AudioPlayer
      audioSrc={`${ANALYSIS_BACKEND.replace(/\/$/, '')}/original-audio/${track.originalClipId}`}
      label={`original audio for ${track.title} at ${formatPosition(track.position)} (up to 30 seconds)`}
      original
    />
  );
}
