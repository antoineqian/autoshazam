'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { sources, tracks } from '@/lib/db/schema';
import { getTeamForUser } from '@/lib/db/queries';
import { recoveredClipsSchema, sameRecoveryRecording } from './original-recovery';
import type { RecoveryContext } from './original-recovery';

async function getRecording(trackId: number) {
  if (!Number.isInteger(trackId) || trackId < 1) throw new Error('Invalid track.');
  const team = await getTeamForUser();
  if (!team) throw new Error('Sign in to restore original audio.');
  const [row] = await db.select({ track: tracks, source: sources }).from(tracks)
    .leftJoin(sources, and(eq(tracks.sourceId, sources.id), eq(sources.teamId, team.id)))
    .where(and(eq(tracks.teamId, team.id), eq(tracks.id, trackId))).limit(1);
  if (!row) throw new Error('This track is no longer in your library.');
  const recording = await db.select().from(tracks).where(and(
    eq(tracks.teamId, team.id),
    row.track.sourceId === null ? eq(tracks.id, trackId) : eq(tracks.sourceId, row.track.sourceId),
    eq(tracks.fileIndex, row.track.fileIndex),
  ));
  return { ...row, recording, team };
}

export async function getOriginalRecoveryAction(trackId: number): Promise<RecoveryContext> {
  const { track, source, recording } = await getRecording(trackId);
  return {
    label: source?.label ?? track.title,
    url: source?.url && /^https?:\/\//i.test(source.url) ? source.url : null,
    existingClipId: track.originalClipId,
    points: recording.filter((row) => !row.originalClipId && row.position !== null && Number.isFinite(row.position) && row.position >= 0)
      .map((row) => ({ id: row.id, position: row.position! })),
  };
}

export async function saveOriginalRecoveryAction(trackId: number, input: unknown) {
  const clips = recoveredClipsSchema.parse(input);
  const { track, recording, team } = await getRecording(trackId);
  const eligible = new Set(recording.filter((row) =>
    sameRecoveryRecording(track, row) && row.position !== null,
  ).map((row) => row.id));
  if (clips.some((clip) => !eligible.has(clip.id))) {
    throw new Error('These clips do not belong to this recording.');
  }
  await db.transaction(async (tx) => {
    for (const clip of clips) {
      await tx.update(tracks).set({ originalClipId: clip.originalClipId }).where(and(
        eq(tracks.teamId, team.id), eq(tracks.id, clip.id),
        // Preserve clips saved by another recovery while this one was running.
        isNull(tracks.originalClipId),
      ));
    }
  });
  revalidatePath('/dashboard/library');
  // Return the stored value, including a concurrent recovery's winning clip.
  const { track: saved } = await getRecording(trackId);
  return saved.originalClipId;
}
