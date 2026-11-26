import { z } from 'zod';

export const recoveredClipsSchema = z.array(z.object({
  id: z.number().int().positive(),
  originalClipId: z.string().regex(/^[0-9a-f]{32}$/),
})).min(1).max(2000).refine(
  (clips) => new Set(clips.map((clip) => clip.id)).size === clips.length,
  'Each track must appear only once.',
);

export type RecoveredClip = z.infer<typeof recoveredClipsSchema>[number];
export type RecoveryContext = {
  label: string;
  url: string | null;
  existingClipId: string | null;
  points: { id: number; position: number }[];
};

/** A synthetic old source can contain several uploaded files. Keep them apart. */
export function sameRecoveryRecording(
  target: { id: number; sourceId: number | null; fileIndex: number },
  candidate: { id: number; sourceId: number | null; fileIndex: number },
) {
  return target.sourceId === null
    ? target.id === candidate.id
    : target.sourceId === candidate.sourceId && target.fileIndex === candidate.fileIndex;
}
