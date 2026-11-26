'use client';

import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { FileAudio, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { ANALYSIS_BACKEND } from '@/lib/analysis/url-analysis';
import { getOriginalRecoveryAction, saveOriginalRecoveryAction } from '@/lib/audio/original-recovery-actions';
import { recoveredClipsSchema } from '@/lib/audio/original-recovery';
import type { RecoveredClip, RecoveryContext } from '@/lib/audio/original-recovery';

export default function OriginalAudioRecovery({ track, onRestored }: {
  track: { id: number; title: string; position: number | null };
  onRestored: (clipId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<RecoveryContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pendingClips, setPendingClips] = useState<RecoveredClip[] | null>(null);
  const timed = track.position !== null && Number.isFinite(track.position) && track.position >= 0;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getOriginalRecoveryAction(track.id);
      if (result.existingClipId) {
        onRestored(result.existingClipId);
        setOpen(false);
      } else {
        setContext(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this recording.');
    } finally {
      setLoading(false);
    }
  };

  const restore = async (useUrl: boolean) => {
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      let clips = pendingClips;
      if (!clips) {
        const form = new FormData();
        form.set('points', JSON.stringify(context.points));
        if (useUrl && context.url) form.set('url', context.url);
        else if (file) form.set('file', file);
        else throw new Error('Select the original recording first.');
        const response = await fetch(`${ANALYSIS_BACKEND.replace(/\/$/, '')}/original-audio/restore`, {
          method: 'POST', body: form,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.detail === 'string' ? body.detail : 'Could not restore original audio. Please try again.');
        }
        clips = recoveredClipsSchema.parse(await response.json());
        setPendingClips(clips);
      }
      const clipId = await saveOriginalRecoveryAction(track.id, clips);
      if (!clipId) throw new Error('This track was removed before its audio could be saved.');
      onRestored(clipId);
      setOpen(false);
      toast.success('Original audio restored. Press Original to play.');
    } catch (err) {
      setError(err instanceof TypeError ? 'Could not reach the audio service. Check that the backend is running.' :
        err instanceof Error ? err.message : 'Could not restore original audio.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={!timed}
          onClick={load}
          aria-label={`${timed ? 'Enable original audio' : 'Original audio unavailable'} for ${track.title}`}
          title={timed ? 'Enable playback from the original recording' : 'This track has no saved timestamp.'}
          className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-orange-600 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          <FileAudio aria-hidden="true" className="h-4 w-4" />
          Original
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
          <Dialog.Title className="pr-6 text-lg font-semibold text-gray-900">Enable original audio</Dialog.Title>
          <Dialog.Description className="text-sm leading-relaxed text-gray-600">
            Earlier analyses did not save playback excerpts. Restore them from the original recording without running Shazam again.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button type="button" disabled={busy} aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"><X className="h-4 w-4" /></button>
          </Dialog.Close>
          {loading && <p role="status" className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading recording…</p>}
          {context && !loading && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="break-words font-medium text-gray-900">{context.label}</p>
                <p className="mt-1 text-gray-500">Restore at the saved timestamps for {context.points.length} {context.points.length === 1 ? 'track' : 'tracks'} in this recording. Older timestamps may mark the start of an analysis interval.</p>
              </div>
              {context.points.length > 0 && !pendingClips && (
                <>
                  {context.url && <Button variant="outline" className="w-full" disabled={busy} onClick={() => restore(true)}>Use saved source URL</Button>}
                  <label className="block space-y-2 text-sm font-medium text-gray-700">
                    <span>{context.url ? 'Or select the original file' : 'Select the original file'}</span>
                    <input type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif,.wma,.webm,.mp4" disabled={busy}
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full min-w-0 text-xs file:mr-3 file:rounded-md file:border file:border-gray-200 file:bg-white file:px-3 file:py-2" />
                  </label>
                  <Button className="w-full" disabled={busy || !file} onClick={() => restore(false)}>Restore from file</Button>
                </>
              )}
              {pendingClips && <Button className="w-full" disabled={busy} onClick={() => restore(false)}>Retry saving</Button>}
              {context.points.length === 0 && <p className="text-sm text-gray-600">No timed tracks need restoration. Refresh your library to see the latest audio.</p>}
              {busy && <p role="status" className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Restoring audio… Keep this page open.</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {!loading && !context && error && <Button variant="outline" onClick={load}>Try again</Button>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
