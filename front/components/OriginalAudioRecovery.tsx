'use client';

import { useEffect, useRef, useState } from 'react';
import { FileAudio, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ANALYSIS_BACKEND } from '@/lib/analysis/url-analysis';
import { getOriginalRecoveryAction, saveOriginalRecoveryAction } from '@/lib/audio/original-recovery-actions';

export default function OriginalAudioRecovery({ track, onRestored, onFile }: {
  track: { id: number; title: string; position: number | null; source?: { url: string | null } | null };
  onRestored: (clipId: string) => void;
  onFile: (file: File) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [useFile, setUseFile] = useState(false);
  const timed = track.position !== null && Number.isFinite(track.position) && track.position >= 0;

  useEffect(() => () => { request.current?.abort(); }, []);

  const play = async () => {
    if (request.current) {
      request.current.abort();
      request.current = null;
      setBusy(false);
      return;
    }
    if (useFile || !track.source?.url) {
      picker.current?.click();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const context = await getOriginalRecoveryAction(track.id);
      if (controller.signal.aborted) return;
      if (context.existingClipId) {
        onRestored(context.existingClipId);
        return;
      }
      if (!context.url) throw new Error('Choose the original file to play this moment.');
      const response = await fetch(`${ANALYSIS_BACKEND.replace(/\/$/, '')}/original-audio/preview`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: context.url, position: track.position }),
      });
      if (!response.ok) throw new Error('Could not play the saved URL. Click Original to choose the file instead.');
      const result = await response.json();
      if (!/^[0-9a-f]{32}$/.test(result.originalClipId)) throw new Error('The audio service returned an invalid preview.');
      if (controller.signal.aborted) return;
      // Start listening immediately. Persist just this track in the background.
      onRestored(result.originalClipId);
      void saveOriginalRecoveryAction(track.id, [{ id: track.id, originalClipId: result.originalClipId }])
        .catch(() => toast.error('Audio is ready, but could not be saved to your library.'));
    } catch (err) {
      if (!controller.signal.aborted) {
        setUseFile(true);
        toast.error(err instanceof TypeError
          ? 'The audio service is unavailable. Click Original to choose the file instead.'
          : err instanceof Error ? err.message : 'Could not load original audio.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <>
      <input ref={picker} type="file" className="hidden" tabIndex={-1} aria-label={`Choose original file for ${track.title}`}
        accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif,.wma,.webm,.mp4"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }} />
      <button type="button" disabled={!timed} onClick={play}
        aria-label={`${busy ? 'Cancel loading original audio' : timed ? 'Play original audio' : 'Original audio unavailable'} for ${track.title}`}
        title={busy ? 'Loading original audio — click to cancel' : timed ? 'Play original audio; choose the file if needed' : 'This track has no saved timestamp.'}
        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:text-gray-300">
        {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileAudio aria-hidden="true" className="h-4 w-4" />}
        <span aria-live="polite">{busy ? 'Loading…' : 'Original'}</span>
      </button>
    </>
  );
}
