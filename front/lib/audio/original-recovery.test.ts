import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveredClipsSchema, sameRecoveryRecording } from './original-recovery';

test('recovery groups one recording while keeping folder files and sourceless tracks separate', () => {
  const target = { id: 1, sourceId: 10, fileIndex: 0 };
  assert.equal(sameRecoveryRecording(target, { ...target, id: 2 }), true);
  assert.equal(sameRecoveryRecording(target, { ...target, id: 2, fileIndex: 1 }), false);
  assert.equal(sameRecoveryRecording(target, { ...target, id: 2, sourceId: 11 }), false);
  assert.equal(sameRecoveryRecording({ ...target, sourceId: null }, { ...target, sourceId: null, id: 2 }), false);
});

test('saved recovery accepts only unique track IDs and opaque clip IDs', () => {
  const clip = { id: 1, originalClipId: 'a'.repeat(32) };
  assert.equal(recoveredClipsSchema.safeParse([clip]).success, true);
  for (const input of [[], [clip, clip], [{ ...clip, id: -1 }], [{ ...clip, originalClipId: '../file' }]]) {
    assert.equal(recoveredClipsSchema.safeParse(input).success, false);
  }
});
