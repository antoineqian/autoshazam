'use server';

import { and, eq } from 'drizzle-orm';
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

  return saved;
}

export async function deleteTrackAction(id: number) {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Team not found');
  }

  await db
    .delete(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.teamId, team.id)));
}
