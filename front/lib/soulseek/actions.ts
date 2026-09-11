'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { downloadPreferences, downloads, tracks } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import {
  DEFAULT_DOWNLOAD_PREFERENCES,
  DOWNLOAD_FORMATS,
  MP3_BITRATES,
} from './preferences';
import type { DownloadPreferences } from './preferences';

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

const preferencesSchema = z.object({
  formatPriority: z
    .array(z.enum(DOWNLOAD_FORMATS))
    .min(1, 'Enable at least one format')
    .refine(
      (formats) => new Set(formats).size === formats.length,
      'A format cannot be listed twice'
    ),
  minMp3Bitrate: z
    .union([z.literal(320), z.literal(256), z.literal(192), z.null()])
    .refine(
      (value) =>
        value === null || (MP3_BITRATES as readonly number[]).includes(value),
      'Unsupported bitrate'
    ),
  autoDownload: z.boolean(),
});

/** The team's preferences, or the defaults when none were saved yet. */
export async function getDownloadPreferencesAction(): Promise<DownloadPreferences> {
  const team = await getTeamForUser();
  if (!team) {
    return DEFAULT_DOWNLOAD_PREFERENCES;
  }

  const [row] = await db
    .select()
    .from(downloadPreferences)
    .where(eq(downloadPreferences.teamId, team.id))
    .limit(1);

  if (!row) {
    return DEFAULT_DOWNLOAD_PREFERENCES;
  }

  // Stored JSON is not typed by the database, so validate on the way out and
  // fall back to the defaults rather than sending garbage to the backend.
  const parsed = preferencesSchema.safeParse({
    formatPriority: row.formatPriority,
    minMp3Bitrate: row.minMp3Bitrate,
    autoDownload: row.autoDownload,
  });

  return parsed.success ? parsed.data : DEFAULT_DOWNLOAD_PREFERENCES;
}

export async function saveDownloadPreferencesAction(
  input: DownloadPreferences
): Promise<DownloadPreferences> {
  const { team } = await requireTeamAndUser();

  const result = preferencesSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message ?? 'Invalid preferences');
  }

  const prefs = result.data;

  await db
    .insert(downloadPreferences)
    .values({
      teamId: team.id,
      formatPriority: prefs.formatPriority,
      minMp3Bitrate: prefs.minMp3Bitrate,
      autoDownload: prefs.autoDownload,
    })
    .onConflictDoUpdate({
      target: downloadPreferences.teamId,
      set: {
        formatPriority: prefs.formatPriority,
        minMp3Bitrate: prefs.minMp3Bitrate,
        autoDownload: prefs.autoDownload,
        updatedAt: new Date(),
      },
    });

  return prefs;
}

type DownloadRecordInput = {
  title: string;
  subtitle: string;
  sourceId?: number | null;
  localPath: string;
  remoteUser?: string | null;
  format?: string | null;
  bitrate?: number | null;
  matchScore?: number | null;
};

/**
 * Records a finished Soulseek download and marks the track as downloaded on
 * every row of the team, matching setTrackDownloadedAction: owning the file is
 * a fact about the track, not about the mix it turned up in.
 */
export async function recordDownloadAction(input: DownloadRecordInput) {
  const { team } = await requireTeamAndUser();

  const [download] = await db
    .insert(downloads)
    .values({
      teamId: team.id,
      sourceId: input.sourceId ?? null,
      title: input.title,
      subtitle: input.subtitle,
      localPath: input.localPath,
      remoteUser: input.remoteUser ?? null,
      format: input.format ?? null,
      bitrate: input.bitrate ?? null,
      matchScore: input.matchScore ?? null,
    })
    .returning();

  const updated = await db
    .update(tracks)
    .set({ downloaded: true })
    .where(
      and(
        eq(tracks.teamId, team.id),
        eq(tracks.title, input.title),
        eq(tracks.subtitle, input.subtitle)
      )
    )
    .returning({ id: tracks.id });

  revalidatePath('/dashboard/library');

  return { download, trackIds: updated.map((row) => row.id) };
}
