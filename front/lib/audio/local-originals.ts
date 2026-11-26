'use client';

import { useSyncExternalStore } from 'react';

// File objects stay on this computer. One selection covers the recording's
// rows and client-side navigation; reloading the page releases the selection.
const recordings = new Map<string, string>();
const listeners = new Set<() => void>();

export function originalRecordingKey(track: { id: number; sourceId?: number | null; fileIndex?: number }) {
  return track.sourceId == null ? `track:${track.id}` : `source:${track.sourceId}:file:${track.fileIndex ?? 0}`;
}

export function selectLocalOriginal(key: string, file: File) {
  const previous = recordings.get(key);
  recordings.set(key, URL.createObjectURL(file));
  if (previous) URL.revokeObjectURL(previous);
  listeners.forEach((listener) => listener());
}

export function forgetLocalOriginal(key: string) {
  const previous = recordings.get(key);
  recordings.delete(key);
  if (previous) URL.revokeObjectURL(previous);
  listeners.forEach((listener) => listener());
}

export function useLocalOriginal(key: string) {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => recordings.get(key) ?? null,
    () => null,
  );
}
