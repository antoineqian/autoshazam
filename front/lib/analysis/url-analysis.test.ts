import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { analyzeUrl } from './url-analysis';

class FakeSocket {
  static current: FakeSocket;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  sent: string[] = [];
  constructor(public url: URL) {
    FakeSocket.current = this;
  }
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    this.onclose?.();
  }
  message(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const original = globalThis.WebSocket;
beforeEach(() => {
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
});
afterEach(() => {
  globalThis.WebSocket = original;
});
const options = () => ({
  url: 'https://example.com/mix',
  interval: 3,
  signal: new AbortController().signal,
  onProgress: () => {},
  onRecord: async () => {},
});

test('completion waits for source and track writes while progress stays live', async () => {
  const written: string[] = [];
  const stages: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let resolved = false;
  const run = analyzeUrl({
    ...options(),
    onProgress: (p) => stages.push(p.stage),
    onRecord: async (record) => {
      if (record.type === 'source') await gate;
      written.push(record.type ?? 'track');
    },
  }).then((result) => {
    resolved = true;
    return result;
  });
  const socket = FakeSocket.current;
  socket.onopen?.();
  assert.deepEqual(socket.sent, ['https://example.com/mix', '3']);
  assert.equal(socket.url.searchParams.get('progress'), '1');
  socket.message({ type: 'source', label: 'Mix' });
  socket.message({
    type: 'progress',
    stage: 'recognizing',
    completed: 2,
    total: 4,
  });
  socket.message({ title: 'Track', subtitle: 'Artist', position: 0 });
  socket.message({ type: 'complete', failedSegments: 1 });
  socket.close();
  await setImmediate();
  assert.equal(resolved, false);
  assert.deepEqual(stages, ['connecting', 'recognizing', 'saving']);
  release();
  assert.deepEqual(await run, { savedTracks: 1, failedSegments: 1 });
  assert.deepEqual(written, ['source', 'track']);
});

test('a save error rejects immediately, even before backend completion', async () => {
  const run = analyzeUrl({
    ...options(),
    onRecord: async () => {
      throw Error('database unavailable');
    },
  });
  const rejected = assert.rejects(run, /Could not save/);
  FakeSocket.current.message({ type: 'source', label: 'Mix' });
  await rejected;
});

test('an unexpected disconnect is an error, not a successful empty run', async () => {
  const run = analyzeUrl(options());
  const rejected = assert.rejects(run, /connection ended/);
  FakeSocket.current.close();
  await rejected;
});

test('backend errors reach the user without being saved as tracks', async () => {
  let writes = 0;
  const run = analyzeUrl({
    ...options(),
    onRecord: async () => {
      writes++;
    },
  });
  const rejected = assert.rejects(run, /Could not download/);
  FakeSocket.current.message({
    type: 'error',
    message: 'Could not download this audio.',
  });
  await rejected;
  assert.equal(writes, 0);
});

test('unmount aborts the connection and ignores later progress', async () => {
  const controller = new AbortController();
  const stages: string[] = [];
  const run = analyzeUrl({
    ...options(),
    signal: controller.signal,
    onProgress: (p) => stages.push(p.stage),
  });
  const rejected = assert.rejects(run, { name: 'AbortError' });
  controller.abort();
  FakeSocket.current.message({ type: 'progress', stage: 'downloading' });
  await rejected;
  assert.deepEqual(stages, ['connecting']);
});
