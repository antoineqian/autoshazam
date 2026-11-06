'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { addManualSetAction } from '@/lib/tracks/actions';
import {
  MAX_TRACKLIST_LENGTH,
  MAX_TRACKS,
  manualSetSchema,
  parseTracklist,
} from '@/lib/tracks/parse-tracklist';
import type { ParsedTrack } from '@/lib/tracks/parse-tracklist';
import type { TrackWithSource } from '@/lib/db/schema';
import { formatPosition } from '@/lib/tracks/library-model';

const fieldClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500';
const primaryClass =
  'rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50';

export function AddSetForm({
  onAdded,
}: {
  onAdded: (tracks: TrackWithSource[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedTrack[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const parsed = useMemo(() => parseTracklist(text), [text]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const save = async () => {
    if (inFlight.current || !preview) return;
    const input = manualSetSchema.safeParse({ title, tracks: preview });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await addManualSetAction(input.data);
      if (result.error || !result.data) {
        setError(result.error ?? 'Could not add this set. Please try again.');
        return;
      }
      onAdded(
        result.data.tracks.map((track) => ({
          ...track,
          source: result.data.source,
        }))
      );
      toast.success('Set added to your library');
      setTitle('');
      setText('');
      setPreview(null);
      close();
    } catch {
      setError(
        'Could not add this set. Your tracklist is still here — please try again.'
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="add-set-form"
        onClick={() => setOpen(true)}
        className={`${primaryClass} inline-flex items-center gap-1.5`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add set
      </button>
      {open && (
        <form
          id="add-set-form"
          aria-label="Add a set"
          className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (preview) void save();
            else {
              setError('');
              setPreview(parsed);
            }
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium text-gray-900">
                Add a set from a tracklist
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Save a set you’ve listened to. No audio or link needed.
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={close}
              aria-label="Close add set"
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-70">
            <div>
              <label
                htmlFor="set-title"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Set title
              </label>
              <input
                id="set-title"
                autoFocus
                required
                maxLength={512}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Sunday listening — November 2026"
                className={fieldClass}
              />
            </div>
            {preview === null ? (
              <div>
                <label
                  htmlFor="set-tracklist"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Tracklist
                </label>
                <textarea
                  id="set-tracklist"
                  required
                  rows={9}
                  maxLength={MAX_TRACKLIST_LENGTH}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-describedby="tracklist-help"
                  placeholder={
                    '00:00 Daphni - Forward\n06:27 Subb-an - Future Textures\n\nOr without timestamps:\nZemög - Babuna\nSciama - Veil Of Mirrors'
                  }
                  className={`${fieldClass} resize-y font-mono`}
                />
                <p id="tracklist-help" className="mt-1.5 text-xs text-gray-500">
                  One track per line, with or without timestamps. Numbered
                  lists, bullets, and dashes are welcome. You can check and edit
                  the tracks next.
                </p>
                <p className="mt-2 text-sm text-gray-600" role="status">
                  {parsed.length} track{parsed.length === 1 ? '' : 's'}
                  {parsed.length > MAX_TRACKS &&
                    ` — please use at most ${MAX_TRACKS}`}
                </p>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Review {preview.length} track{preview.length === 1 ? '' : 's'}
                </h3>
                <p className="mb-3 mt-1 text-xs text-gray-500">
                  Check the artist and title before saving. Lines without a
                  separator stay together in Title; you can split them here or
                  leave them as they are. Blank times stay blank.
                </p>
                <div className="max-h-80 overflow-auto rounded-md border border-gray-200">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th scope="col" className="p-2">
                          Time
                        </th>
                        <th scope="col" className="p-2">
                          Artist (optional)
                        </th>
                        <th scope="col" className="p-2">
                          Title
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((track, index) => (
                        <tr key={index} className="border-t border-gray-100">
                          <td className="whitespace-nowrap p-2 text-xs tabular-nums text-gray-500">
                            {formatPosition(track.position) || '—'}
                          </td>
                          {(['subtitle', 'title'] as const).map((key) => (
                            <td key={key} className="p-1.5">
                              <input
                                aria-label={`${key === 'title' ? 'Title' : 'Artist'} for track ${index + 1}`}
                                required={key === 'title'}
                                maxLength={255}
                                value={track[key]}
                                onChange={(event) =>
                                  setPreview(
                                    preview.map((row, i) =>
                                      i === index
                                        ? { ...row, [key]: event.target.value }
                                        : row
                                    )
                                  )
                                }
                                className={fieldClass}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={
                  !title.trim() ||
                  parsed.length === 0 ||
                  parsed.length > MAX_TRACKS
                }
                className={primaryClass}
              >
                {saving
                  ? 'Adding set…'
                  : preview
                    ? 'Add to library'
                    : 'Review tracklist'}
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setError('');
                  }}
                  className="text-sm text-gray-600 hover:underline"
                >
                  Edit pasted text
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="text-sm text-gray-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
