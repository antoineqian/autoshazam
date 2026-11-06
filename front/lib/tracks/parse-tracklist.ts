import { z } from 'zod';

export const MAX_TRACKS = 500;
export const MAX_TRACKLIST_LENGTH = 100_000;

export type ParsedTrack = {
  title: string;
  subtitle: string;
  position: number | null;
};

/** One line per track. Never guess the boundary of a multi-word artist name. */
export function parseTracklist(text: string): ParsedTrack[] {
  return text.split(/\r\n?|\n/).flatMap((raw) => {
    let line = raw.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '');
    if (!line) return [];

    let position: number | null = null;
    const timestamp = line.match(
      /^(?:\[(\d{1,3}:\d{2}(?::\d{2})?)\]|\((\d{1,3}:\d{2}(?::\d{2})?)\)|(\d{1,3}:\d{2}(?::\d{2})?))(?=\s|$)/
    );
    if (timestamp) {
      const parts = (timestamp[1] ?? timestamp[2] ?? timestamp[3])
        .split(':')
        .map(Number);
      if (parts.slice(1).every((part) => part < 60)) {
        const seconds = parts.reduce((total, part) => total * 60 + part, 0);
        position = seconds / 60;
        line = line
          .slice(timestamp[0].length)
          .trim()
          .replace(/^[-–—|]\s+/, '');
      }
    }

    // Spaces around separators protect names such as K-LONE and Subb-an.
    const separator = /\s+[-–—|]\s+|\t+/.exec(line);
    if (separator) {
      return [
        {
          subtitle: line.slice(0, separator.index).trim(),
          title: line.slice(separator.index + separator[0].length).trim(),
          position,
        },
      ];
    }
    return [{ title: line, subtitle: '', position }];
  });
}

// Validate again on the server: the preview is editable and client input is untrusted.
export const manualSetSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Enter a set title.')
    .max(512, 'Keep the set title under 513 characters.'),
  tracks: z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, 'Every track needs a title.')
          .max(255, 'Keep each track title under 256 characters.'),
        subtitle: z
          .string()
          .trim()
          .max(255, 'Keep each artist under 256 characters.'),
        position: z
          .number()
          .finite()
          .min(0)
          .max(3_599_999 / 60)
          .nullable(),
      })
    )
    .min(1, 'Paste at least one track.')
    .max(MAX_TRACKS, `Add up to ${MAX_TRACKS} tracks at a time.`),
});
