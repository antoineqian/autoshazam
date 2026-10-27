import React from 'react';
import Link from 'next/link';
import copy from 'clipboard-copy';
import toast from 'react-hot-toast';
import {
  ArrowUpRight,
  Copy,
  Download,
  Library,
  ListMusic,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPosition } from '@/lib/tracks/library-model';
import AudioPlayer from './AudioPlayer';

/** @param {{ tracks: any[], deleteTrack: (id: number) => void, reset?: () => void, busy?: boolean }} props */
export default function ListTracks({
  tracks,
  deleteTrack,
  reset,
  busy = false,
}) {
  const seen = new Set();
  const sortedTracks = tracks
    .filter((track) => {
      const key = JSON.stringify([track.title, track.subtitle]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.position - b.position);

  const copyTrack = async (track) => {
    try {
      await copy(`${track.subtitle} ${track.title}`);
      toast.success('Track copied');
    } catch {
      toast.error('Could not copy this track');
    }
  };
  const exportToText = () => {
    const blob = new Blob(
      [
        sortedTracks
          .map((track) => `${track.subtitle} ${track.title}`)
          .join('\n'),
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tracks.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="analysis-results-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="analysis-results-heading"
            className="flex items-center gap-2 font-semibold text-gray-900"
          >
            Your tracklist{' '}
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-500">
              {sortedTracks.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {sortedTracks.length
              ? 'Identified tracks are saved to your library.'
              : 'Your discoveries will appear here.'}
          </p>
        </div>
        {sortedTracks.length > 0 && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={exportToText}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            {reset && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={reset}
                title="Clear this list. Saved tracks stay in your library."
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      {!sortedTracks.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            ) : (
              <ListMusic className="h-5 w-5" />
            )}
          </div>
          <p className="text-sm font-medium text-gray-700">
            {busy
              ? 'Waiting for your first discovery'
              : 'Every mix has a tracklist to uncover'}
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">
            {busy
              ? 'Your results will appear here once tracks are identified and saved.'
              : 'Choose your audio above, and we’ll help you find what’s playing.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {sortedTracks.map((track) => (
            <li
              key={track.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
            >
              <span className="w-12 shrink-0 text-xs tabular-nums text-gray-400">
                {formatPosition(track.position)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {track.title}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {track.subtitle}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-0.5">
                {track.uri && <AudioPlayer audioSrc={track.uri} />}
                {track.url && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400"
                  >
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${track.title} in Shazam`}
                      title="Open in Shazam"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400"
                  onClick={() => copyTrack(track)}
                  aria-label={`Copy ${track.title}`}
                  title="Copy track"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-600"
                  disabled={busy}
                  onClick={() => deleteTrack(track.id)}
                  aria-label={`Delete ${track.title} from this analysis`}
                  title="Delete from this analysis and your library"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {sortedTracks.length > 0 && (
        <Link
          href="/dashboard/library"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
        >
          <Library className="h-3.5 w-3.5" />
          View in your library
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </section>
  );
}
