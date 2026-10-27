'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  AudioLines,
  Check,
  CheckCircle2,
  FileAudio,
  FolderOpen,
  Link2,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ANALYSIS_BACKEND, analyzeUrl } from '@/lib/analysis/url-analysis';
import type {
  AnalysisProgress,
  AnalysisRecord,
} from '@/lib/analysis/url-analysis';

type Mode = 'file' | 'folder' | 'url';
const modes = [
  { id: 'file', label: 'Audio file', icon: FileAudio },
  { id: 'folder', label: 'Folder', icon: FolderOpen },
  { id: 'url', label: 'Mix URL', icon: Link2 },
] as const;
const audioExtensions = /\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff?|wma)$/i;
const bytes = (value: number) => `${(value / (1024 * 1024)).toFixed(1)} MB`;

export default function FileUploadForm({
  onRecord,
  onResults,
  onStart,
  onBusyChange,
}: {
  onRecord: (record: AnalysisRecord) => Promise<void>;
  onResults: (tracks: any[]) => Promise<number>;
  onStart: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [interval, setInterval] = useState('3');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState('');
  const [selectionNote, setSelectionNote] = useState('');
  const [savedTracks, setSavedTracks] = useState(0);
  const [failedSegments, setFailedSegments] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const selectFiles = (selected: FileList | null) => {
    const all = Array.from(selected ?? []);
    const audio = all.filter(
      (file) =>
        file.type.startsWith('audio/') || audioExtensions.test(file.name),
    );
    setFiles(audio);
    setError(
      all.length && !audio.length
        ? 'No audio files found. Choose an MP3, WAV, FLAC, or another supported audio file.'
        : '',
    );
    const skipped = all.length - audio.length;
    setSelectionNote(
      skipped
        ? `${skipped} non-audio file${skipped === 1 ? '' : 's'} skipped.`
        : '',
    );
    setProgress(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (controller.current) return;
    const minutes = Number(interval);
    if (!Number.isSafeInteger(minutes) || minutes < 1) {
      setError('Choose a whole-number interval of at least one minute.');
      return;
    }
    if (mode !== 'url' && !files.length) {
      setError('Choose audio to analyze first.');
      return;
    }
    if (mode === 'url') {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        setError('Enter a valid http(s) link to your mix.');
        return;
      }
    }
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    onBusyChange(true);
    onStart();
    setError('');
    setFailedSegments(0);
    setSavedTracks(0);
    try {
      if (mode === 'url') {
        const result = await analyzeUrl({
          url: url.trim(),
          interval: minutes,
          signal: run.signal,
          onProgress: setProgress,
          onRecord,
        });
        setSavedTracks(result.savedTracks);
        setFailedSegments(result.failedSegments);
      } else {
        setProgress({ stage: 'uploading' });
        const data = new FormData();
        data.append('interval', String(minutes));
        files.forEach((file) => data.append('files', file));
        const response = await axios.post(
          `${ANALYSIS_BACKEND}/processFolder`,
          data,
          {
            signal: run.signal,
            onUploadProgress: ({ loaded, total }) => {
              if (run.signal.aborted) return;
              setProgress(
                total && loaded >= total
                  ? { stage: 'recognizing' }
                  : {
                      stage: 'uploading',
                      downloadedBytes: loaded,
                      totalBytes: total,
                    },
              );
            },
          },
        );
        if (!Array.isArray(response.data))
          throw new Error(
            'The audio service could not analyze these files. Please try again.',
          );
        if (run.signal.aborted) return;
        setProgress({ stage: 'saving' });
        setSavedTracks(await onResults(response.data));
      }
      if (!run.signal.aborted) setProgress({ stage: 'done' });
    } catch (cause) {
      if (!run.signal.aborted) {
        const detail = axios.isAxiosError(cause)
          ? cause.response?.data?.detail
          : null;
        setError(
          typeof detail === 'string'
            ? detail
            : axios.isAxiosError(cause) && !cause.response
              ? 'Could not reach the audio service. Check that the backend is running, then try again.'
              : cause instanceof Error
                ? cause.message
                : 'Analysis could not finish. Please try again.',
        );
      }
    } finally {
      if (!run.signal.aborted) {
        setBusy(false);
        onBusyChange(false);
      }
      controller.current = null;
    }
  };

  const steps =
    mode === 'url'
      ? [
          'Download audio',
          'Prepare audio',
          'Identify tracks',
          'Save to library',
        ]
      : ['Upload audio', 'Analyze audio', 'Save to library'];
  const stage = progress?.stage;
  const active =
    mode === 'url'
      ? {
          connecting: 0,
          downloading: 0,
          preparing: 1,
          recognizing: 2,
          saving: 3,
          done: 4,
          uploading: 0,
        }[stage ?? 'connecting']
      : {
          uploading: 0,
          recognizing: 1,
          saving: 2,
          done: 3,
          connecting: 0,
          preparing: 1,
          downloading: 0,
        }[stage ?? 'uploading'];
  const percent =
    progress?.totalBytes && progress.downloadedBytes !== undefined
      ? Math.min(
          100,
          Math.round((progress.downloadedBytes / progress.totalBytes) * 100),
        )
      : stage === 'recognizing' && progress?.total
        ? Math.round(((progress.completed ?? 0) / progress.total) * 100)
        : null;
  const title =
    stage === 'connecting'
      ? 'Connecting to the audio service'
      : stage === 'downloading'
        ? 'Downloading your audio'
        : stage === 'uploading'
          ? 'Uploading your audio'
          : stage === 'preparing'
            ? 'Preparing audio samples'
            : stage === 'recognizing'
              ? mode === 'url'
                ? 'Identifying tracks'
                : 'Preparing and identifying tracks'
              : stage === 'saving'
                ? 'Saving to your library'
                : 'Analysis complete';
  const detail =
    stage === 'connecting'
      ? 'Waiting for the audio service to accept your mix.'
      : stage === 'downloading' || stage === 'uploading'
        ? progress?.downloadedBytes !== undefined
          ? `${bytes(progress.downloadedBytes)}${progress.totalBytes ? ` of ${bytes(progress.totalBytes)}` : ' transferred'}`
          : mode === 'url'
            ? 'Fetching the audio from your link. Large mixes can take a little longer.'
            : 'Sending your audio to the analysis service.'
        : stage === 'preparing'
          ? 'Decoding your mix and splitting it into samples.'
          : stage === 'recognizing'
            ? progress?.total !== undefined
              ? `${progress.completed ?? 0} of ${progress.total} samples checked. Matches appear below as they are saved.`
              : `Analyzing ${files.length} audio file${files.length === 1 ? '' : 's'}. Results appear when analysis finishes.`
            : stage === 'saving'
              ? 'Adding your discoveries to the library. Keep this page open for a moment.'
              : savedTracks
                ? `${savedTracks} detection${savedTracks === 1 ? '' : 's'} saved to your library.`
                : 'No tracks were identified. Try a shorter sampling interval or another recording.';

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <form
        onSubmit={submit}
        className="space-y-6 p-5 sm:p-6"
        aria-label="Analyze audio"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <AudioLines className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Start with a mix</h2>
            <p className="text-sm text-gray-500">
              Upload your audio or bring a link.
            </p>
          </div>
        </div>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1"
          role="group"
          aria-label="Audio source"
        >
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id);
                setFiles([]);
                setError('');
                setSelectionNote('');
                setProgress(null);
              }}
              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-60 sm:gap-2 sm:px-2 sm:text-sm ${mode === id ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {mode === 'url' ? (
          <div className="space-y-2">
            <label
              htmlFor="mix-url"
              className="text-sm font-medium text-gray-900"
            >
              Mix URL
            </label>
            <Input
              id="mix-url"
              type="url"
              required
              disabled={busy}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://soundcloud.com/artist/mix"
              className="h-11 bg-white focus-visible:border-orange-400 focus-visible:ring-orange-100"
            />
            <p className="text-xs text-gray-500">
              A public link from SoundCloud, YouTube, or another supported site.
            </p>
          </div>
        ) : (
          <div>
            <input
              ref={input}
              key={mode}
              id="audio-files"
              type="file"
              className="hidden"
              aria-label="Select audio files"
              disabled={busy}
              accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif,.wma"
              {...(mode === 'folder'
                ? { webkitdirectory: '', multiple: true }
                : {})}
              onChange={(event) => selectFiles(event.target.files)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-5 py-8 text-center transition-colors hover:border-orange-300 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-60"
            >
              {mode === 'folder' ? (
                <FolderOpen className="mb-1 h-7 w-7 text-gray-400" />
              ) : (
                <Upload className="mb-1 h-7 w-7 text-gray-400" />
              )}
              <span className="max-w-full break-all text-sm font-medium text-gray-900">
                {files.length
                  ? mode === 'folder'
                    ? `${files.length} audio files selected`
                    : files[0].name
                  : mode === 'folder'
                    ? 'Choose a folder of audio files'
                    : 'Choose an audio file'}
              </span>
              <span className="text-xs text-gray-500">
                {files.length
                  ? `${bytes(files.reduce((sum, file) => sum + file.size, 0))} · Click to change selection`
                  : 'MP3, WAV, FLAC, M4A, and more'}
              </span>
            </button>
            {selectionNote && (
              <p className="mt-2 text-xs text-gray-500">{selectionNote}</p>
            )}
          </div>
        )}
        <div className="flex flex-col justify-between gap-5 border-t border-gray-100 pt-5 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <label
              htmlFor="analysis-interval"
              className="text-sm font-medium text-gray-900"
            >
              Sample every
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="analysis-interval"
                type="number"
                min="1"
                step="1"
                required
                disabled={busy}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="h-10 w-20 bg-white focus-visible:border-orange-400 focus-visible:ring-orange-100"
              />
              <span className="text-sm text-gray-600">minutes</span>
            </div>
            <p className="text-xs text-gray-500">
              Shorter intervals can find more tracks.
            </p>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="h-11 bg-orange-500 px-6 text-white hover:bg-orange-600"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {busy ? 'Analyzing…' : 'Find tracks'}
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </form>
      {progress && !error && (
        <div className="space-y-5 border-t border-gray-200 bg-gray-50/70 p-5 sm:p-6">
          <ol
            aria-label="Analysis steps"
            className={`grid gap-3 ${mode === 'url' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}
          >
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={active === index ? 'step' : undefined}
                className={`flex items-center gap-2 text-xs font-medium ${index <= active ? 'text-gray-800' : 'text-gray-400'}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index < active ? 'bg-orange-100 text-orange-700' : index === active ? 'bg-orange-500 text-white' : 'border border-gray-200 bg-white'}`}
                >
                  {index < active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : index === active && busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    index + 1
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <div role="status" aria-live="polite" aria-atomic="true">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {stage === 'done' && (
                  <CheckCircle2 className="h-4 w-4 text-orange-600" />
                )}
                {title}
              </p>
              {percent !== null && (
                <span className="text-sm font-medium tabular-nums text-orange-700">
                  {percent}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {detail}
            </p>
          </div>
          {busy && percent !== null && (
            <div
              role="progressbar"
              aria-label={title}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 overflow-hidden rounded-full bg-gray-200"
            >
              <div
                className="h-full rounded-full bg-orange-500 transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
          {stage === 'done' && failedSegments > 0 && (
            <p role="alert" className="text-xs text-amber-800">
              {failedSegments} sample{failedSegments === 1 ? '' : 's'} could not
              be checked because recognition failed. Your other results have
              been saved.
            </p>
          )}
          {busy && (
            <p className="text-xs text-gray-400">
              Keep this page open while your mix is being analyzed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
