'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { sources, tracks } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';

type TrackInput = {
  title: string;
  subtitle: string;
  position: number;
  fileIndex?: number;
  url?: string;
  uri?: string;
};

type SourceInput = {
  kind?: string;
  label: string;
  url?: string;
  intervalMinutes?: number;
};

async function requireTeamAndUser() {
  const user = await getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  return { user, team };
}

/** Opens a run. URL analyses call this first, then stream tracks into it. */
export async function createSourceAction(input: SourceInput) {
  const { user, team } = await requireTeamAndUser();

  const [source] = await db
    .insert(sources)
    .values({
      teamId: team.id,
      userId: user.id,
      kind: input.kind ?? 'unknown',
      label: input.label,
      url: input.url,
      intervalMinutes: input.intervalMinutes,
    })
    .returning();

  revalidatePath('/dashboard/library');

  return source;
}

export async function saveTrackAction(input: TrackInput & { sourceId?: number }) {
  const { user, team } = await requireTeamAndUser();

  const [saved] = await db
    .insert(tracks)
    .values({
      teamId: team.id,
      userId: user.id,
      sourceId: input.sourceId,
      title: input.title,
      subtitle: input.subtitle,
      position: input.position,
      fileIndex: input.fileIndex ?? 0,
      url: input.url,
      uri: input.uri,
    })
    .returning();

  revalidatePath('/dashboard/library');

  return saved;
}

/** Records a finished run and its tracks together, for file and folder mode. */
export async function saveAnalysisAction(input: {
  source: SourceInput;
  tracks: TrackInput[];
}) {
  const { user, team } = await requireTeamAndUser();

  const [source] = await db
    .insert(sources)
    .values({
      teamId: team.id,
      userId: user.id,
      kind: input.source.kind ?? 'unknown',
      label: input.source.label,
      url: input.source.url,
      intervalMinutes: input.source.intervalMinutes,
    })
    .returning();

  const saved = input.tracks.length
    ? await db
        .insert(tracks)
        .values(
          input.tracks.map((track) => ({
            teamId: team.id,
            userId: user.id,
            sourceId: source.id,
            title: track.title,
            subtitle: track.subtitle,
            position: track.position,
            fileIndex: track.fileIndex ?? 0,
            url: track.url,
            uri: track.uri,
          }))
        )
        .returning()
    : [];

  revalidatePath('/dashboard/library');

  return { source, tracks: saved };
}

/**
 * Removes a track from one run.
 *
 * Sampling a mix at a fixed interval detects the same track at consecutive
 * points, so one visible row stands for several stored detections within that
 * run; all of them go. Detections of the same track in *other* runs are left
 * alone - those record what was genuinely in a different recording.
 */
export async function deleteTrackAction(id: number) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const [target] = await db
    .select({
      title: tracks.title,
      subtitle: tracks.subtitle,
      sourceId: tracks.sourceId,
    })
    .from(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.teamId, team.id)))
    .limit(1);

  if (!target) {
    throw new Error(`Track ${id} was not found or already deleted`);
  }

  const sameTrack = and(
    eq(tracks.teamId, team.id),
    eq(tracks.title, target.title),
    eq(tracks.subtitle, target.subtitle)
  );

  const deleted = await db
    .delete(tracks)
    .where(
      target.sourceId === null
        ? and(sameTrack, eq(tracks.id, id))
        : and(sameTrack, eq(tracks.sourceId, target.sourceId))
    )
    .returning({ id: tracks.id });

  revalidatePath('/dashboard/library');

  return deleted.map((row) => row.id);
}

/** Removes a track from every run, for the flat "All tracks" view. */
export async function deleteTrackEverywhereAction(id: number) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const [target] = await db
    .select({ title: tracks.title, subtitle: tracks.subtitle })
    .from(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.teamId, team.id)))
    .limit(1);

  if (!target) {
    throw new Error(`Track ${id} was not found or already deleted`);
  }

  const deleted = await db
    .delete(tracks)
    .where(
      and(
        eq(tracks.teamId, team.id),
        eq(tracks.title, target.title),
        eq(tracks.subtitle, target.subtitle)
      )
    )
    .returning({ id: tracks.id });

  revalidatePath('/dashboard/library');

  return deleted.map((row) => row.id);
}

/**
 * Marks a track as being in the user's own collection, or not.
 *
 * The flag is written to every row of that track across every run: having the
 * file is a fact about the track itself, so a track marked downloaded in one
 * mix must not look missing in another.
 */
export async function setTrackDownloadedAction(id: number, downloaded: boolean) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const [target] = await db
    .select({ title: tracks.title, subtitle: tracks.subtitle })
    .from(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.teamId, team.id)))
    .limit(1);

  if (!target) {
    throw new Error(`Track ${id} was not found`);
  }

  const updated = await db
    .update(tracks)
    .set({ downloaded })
    .where(
      and(
        eq(tracks.teamId, team.id),
        eq(tracks.title, target.title),
        eq(tracks.subtitle, target.subtitle)
      )
    )
    .returning({ id: tracks.id });

  revalidatePath('/dashboard/library');

  return updated.map((row) => row.id);
}

/** Removes a whole run and everything detected in it. */
export async function deleteSourceAction(id: number) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const [source] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.id, id), eq(sources.teamId, team.id)))
    .limit(1);

  if (!source) {
    throw new Error(`Source ${id} was not found or already deleted`);
  }

  await db
    .delete(tracks)
    .where(and(eq(tracks.teamId, team.id), eq(tracks.sourceId, source.id)));

  await db
    .delete(sources)
    .where(and(eq(sources.id, source.id), eq(sources.teamId, team.id)));

  revalidatePath('/dashboard/library');
}

/** Renames a run, so backfilled "Unknown source" groups can be given names. */
export async function renameSourceAction(id: number, label: string) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('A source needs a name');
  }

  const [updated] = await db
    .update(sources)
    .set({ label: trimmed.slice(0, 512) })
    .where(and(eq(sources.id, id), eq(sources.teamId, team.id)))
    .returning();

  if (!updated) {
    throw new Error(`Source ${id} was not found`);
  }

  revalidatePath('/dashboard/library');

  return updated;
}
