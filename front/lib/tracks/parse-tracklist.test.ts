import assert from 'node:assert/strict';
import test from 'node:test';
import { manualSetSchema, parseTracklist } from './parse-tracklist';
import {
  formatPosition,
  formatTracklistLine,
  groupBySource,
} from './library-model';
import type { TrackWithSource } from '../db/schema';

const timed = `00:00 Daphni Forward
06:27 Subb-an Future Textures
10:13 Main Phase Sunpetal
17:21 Ovrtic - Eyes on the prize
22:01 Dennis Quin Musical Movement
24:40 Ysca - Push
27:40 O'Flynn Obey
29:36 SDK, Simone de Kunovich Summer Card
35:05 Milo Neep (unreleased)
37:00 Fonzo Twister
40:40 Mezza Yoghurt
41:59 Fellsius HIGHNOTE
43:39 Emalkay Crusader
46:00 Will Hofbauer - Microplastics (Unreleased)
49:15 Casey Spillman - Lonely (new Hessle Audio)
59:18 K-LONE Love Me a Little More`;

const untimed = `Zemög - Babuna
Sciama - Veil Of Mirrors
Ehua & Flore - Pyrexia (dBridge Fever Up mix)
Rhywtwo - Whatever You Do, Don't Give This To Rhyw!
Emily Jeanne - Count Me Out (D.K. Remix)
Tadan - Vagrant Seer
TEACHI - 湧ヶ峰 [WAKUGAMINE]
Cari Lekebusch & Spekki Webu - Psycho Magnotheric Pt.2
Artilect - Rhythm Seeker
Photek - Santiago
Human Space Machine - Gallop
Scan One - Zero Zero
POD & Tamen - Uma
Aryo Adhianto - Odile
Fracture x Tim Reaper - Lickshot
Basic Rhythm - Talk 'Bout
My Boyfriend & WYSid - Torsion
Aleksi Perälä - FI3AC2513401
Holsten - Projectiles (Overlook Remix)
Loxy & Resound - Blossom
Structur - The Oraculum Paths
Xades - Qluless`;

test('imports the supplied timestamped list without inventing artist boundaries', () => {
  const tracks = parseTracklist(timed);
  assert.equal(tracks.length, 16);
  assert.deepEqual(tracks[2], {
    title: 'Main Phase Sunpetal',
    subtitle: '',
    position: 613 / 60,
  });
  assert.deepEqual(tracks[3], {
    title: 'Eyes on the prize',
    subtitle: 'Ovrtic',
    position: 1041 / 60,
  });
  assert.equal(formatPosition(tracks[1].position), '6:27');
  assert.equal(formatPosition(tracks[15].position), '59:18');
  assert.equal(
    manualSetSchema.safeParse({ title: 'Mix', tracks }).success,
    true
  );
});

test('imports the supplied untimed list and exports accents, punctuation and remixes intact', () => {
  const tracks = parseTracklist(untimed);
  assert.equal(tracks.length, 22);
  assert.ok(tracks.every((track) => track.position === null));
  assert.equal(tracks[7].subtitle, 'Cari Lekebusch & Spekki Webu');
  assert.equal(tracks.map(formatTracklistLine).join('\n'), untimed);
});

test('accepts blank lines, CRLF, bullets, numbering, tabs, dash variants and hour timestamps', () => {
  const tracks = parseTracklist(
    ' \r\n1. [00:00] K-LONE – Love Me\r\n• (1:02:03) Artist — Title - Remix\n- Other\tSong\n04) 123:45 Artist | Last\n'
  );
  assert.deepEqual(tracks, [
    { subtitle: 'K-LONE', title: 'Love Me', position: 0 },
    { subtitle: 'Artist', title: 'Title - Remix', position: 3723 / 60 },
    { subtitle: 'Other', title: 'Song', position: null },
    { subtitle: 'Artist', title: 'Last', position: 7425 / 60 },
  ]);
  assert.equal(
    formatTracklistLine(tracks[1]),
    '1:02:03  Artist - Title - Remix'
  );
});

test('does not silently discard malformed timestamps, ambiguous names or timestamp-only rows', () => {
  assert.deepEqual(parseTracklist('01:99 Artist - Track')[0], {
    subtitle: '01:99 Artist',
    title: 'Track',
    position: null,
  });
  assert.equal(
    parseTracklist('K-LONE Love Me a Little More')[0].title,
    'K-LONE Love Me a Little More'
  );
  assert.equal(
    manualSetSchema.safeParse({ title: 'Mix', tracks: parseTracklist('00:00') })
      .success,
    false
  );
  assert.deepEqual(parseTracklist(' \n\t\n'), []);
});

test('validates required fields and limits on the server payload', () => {
  const valid = {
    title: ' Mix ',
    tracks: [{ title: ' Song ', subtitle: ' Artist ', position: null }],
  };
  assert.deepEqual(manualSetSchema.parse(valid), {
    title: 'Mix',
    tracks: [{ title: 'Song', subtitle: 'Artist', position: null }],
  });
  for (const input of [
    null,
    { ...valid, title: ' ' },
    { ...valid, title: 'x'.repeat(513) },
    { ...valid, tracks: [] },
    { ...valid, tracks: Array(501).fill(valid.tracks[0]) },
    ...[
      { title: '' },
      { title: 'x'.repeat(256) },
      { subtitle: 'x'.repeat(256) },
      { position: -1 },
      { position: Infinity },
      { position: '0:00' },
    ].map((patch) => ({
      ...valid,
      tracks: [{ ...valid.tracks[0], ...patch }],
    })),
  ])
    assert.equal(manualSetSchema.safeParse(input).success, false);
});

function row(
  id: number,
  position: number | null,
  kind = 'manual'
): TrackWithSource {
  return {
    id,
    title: id === 3 ? 'Song 1' : `Song ${id}`,
    subtitle: 'Artist',
    position,
    tracklistOrder: kind === 'manual' ? id - 1 : null,
    teamId: 1,
    userId: 1,
    sourceId: 1,
    fileIndex: 0,
    url: null,
    uri: null,
    downloaded: false,
    favorited: false,
    createdAt: new Date(0),
    source: {
      id: 1,
      kind,
      label: 'Mix',
      teamId: 1,
      userId: 1,
      url: null,
      intervalMinutes: null,
      createdAt: new Date(0),
    },
  };
}

test('manual sets preserve pasted order and repeats when timestamps are mixed or out of order', () => {
  const tracks = [row(3, 1), row(2, null), row(1, 2)];
  const group = groupBySource(tracks, 'newest')[0];
  assert.deepEqual(
    group.tracks.map((track) => track.id),
    [1, 2, 3]
  );
  assert.deepEqual(group.tracks.map(formatTracklistLine), [
    '2:00  Artist - Song 1',
    'Artist - Song 2',
    '1:00  Artist - Song 1',
  ]);
});

test('analysed sets still collapse repeated detections to the earliest position', () => {
  const group = groupBySource(
    [row(1, 3, 'file'), row(2, 1, 'file'), row(3, 2, 'file')],
    'newest'
  )[0];
  assert.deepEqual(
    group.tracks.map((track) => track.id),
    [2, 3]
  );
});

test('export preserves seconds after PostgreSQL real precision and omits absent timestamps', () => {
  for (const track of parseTracklist(timed)) {
    assert.equal(
      formatPosition(Math.fround(track.position!)),
      formatPosition(track.position)
    );
  }
  assert.equal(formatPosition(null), '');
  assert.equal(formatPosition(0), '0:00');
  assert.equal(formatPosition(60), '1:00:00');
  assert.equal(
    formatTracklistLine({
      title: 'Main Phase Sunpetal',
      subtitle: '',
      position: null,
    }),
    'Main Phase Sunpetal'
  );
});
