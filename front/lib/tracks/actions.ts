'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { tracks } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';

export async function saveTrackAction(input: {
  title: string;
  subtitle: string;
  position: number;
  fileIndex?: number;
  url?: string;
  uri?: string;
}) {
  const user = await getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  const [saved] = await db
    .insert(tracks)
    .values({
      teamId: team.id,
      userId: user.id,
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

export async function deleteTrackAction(id: number) {
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

  // Scanning a mix at a fixed interval detects the same track several times, so
  // one visible row usually stands for several stored detections. Deleting only
  // the clicked id would just promote the next duplicate into its place, which
  // is why a deleted track kept reappearing in the library.
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
