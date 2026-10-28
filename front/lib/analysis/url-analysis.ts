export const ANALYSIS_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export type AnalysisProgress = {
  stage:
    | 'connecting'
    | 'uploading'
    | 'downloading'
    | 'preparing'
    | 'recognizing'
    | 'saving'
    | 'done';
  downloadedBytes?: number;
  totalBytes?: number;
  completed?: number;
  total?: number;
  failedSegments?: number;
};

export type AnalysisRecord =
  | {
      type: 'source';
      kind: string;
      label: string;
      url: string;
      intervalMinutes: number;
    }
  | {
      type?: undefined;
      title: string;
      subtitle: string;
      position: number;
      url?: string;
      uri?: string;
    };

/** Backend completion and database completion are separate: keep the run busy
 * until every queued source/track write has succeeded. Progress never waits on
 * those writes, so a slow database doesn't hide download/recognition updates. */
export function analyzeUrl({
  url,
  interval,
  signal,
  onProgress,
  onRecord,
}: {
  url: string;
  interval: number;
  signal: AbortSignal;
  onProgress: (progress: AnalysisProgress) => void;
  onRecord: (record: AnalysisRecord) => Promise<void>;
}): Promise<{ savedTracks: number; failedSegments: number }> {
  return new Promise((resolve, reject) => {
    const endpoint = new URL('/url?progress=1', ANALYSIS_BACKEND);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(endpoint);
    let writes = Promise.resolve();
    let finished = false;
    let receivedCompletion = false;
    let savedTracks = 0;
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            'Could not connect to the audio service. Check that the backend is running.',
          ),
        ),
      15000,
    );
    const cleanUp = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      socket.close();
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanUp();
      reject(error);
    };
    const abort = () =>
      fail(new DOMException('Analysis stopped', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    onProgress({ stage: 'connecting' });
    socket.onopen = () => {
      if (finished) return;
      clearTimeout(timeout);
      socket.send(url);
      socket.send(String(interval));
    };
    socket.onerror = () =>
      fail(
        new Error(
          'Could not reach the audio service. Check that the backend is running, then try again.',
        ),
      );
    socket.onclose = () => {
      if (!receivedCompletion)
        fail(
          new Error(
            'The connection ended before analysis finished. Any tracks already saved are still in your library.',
          ),
        );
    };
    socket.onmessage = (event) => {
      if (finished || receivedCompletion) return;
      try {
        const message =
          event.data === 'DONE' ? { type: 'complete' } : JSON.parse(event.data);
        if (message.type === 'error') {
          fail(new Error(message.message || 'Analysis could not finish.'));
        } else if (message.type === 'progress') {
          if (
            ['downloading', 'preparing', 'recognizing'].includes(message.stage)
          )
            onProgress(message);
        } else if (message.type === 'complete') {
          receivedCompletion = true;
          onProgress({ stage: 'saving' });
          writes
            .then(() => {
              if (finished) return;
              finished = true;
              cleanUp();
              resolve({
                savedTracks,
                failedSegments: message.failedSegments ?? 0,
              });
            })
            .catch(fail);
        } else if (
          message.type === 'source' ||
          (typeof message.title === 'string' &&
            typeof message.position === 'number')
        ) {
          writes = writes.then(async () => {
            if (finished) return;
            await onRecord(message);
            if (message.type !== 'source') savedTracks += 1;
          });
          // Attach a handler immediately; writes may fail before DONE arrives.
          writes.catch(() =>
            fail(
              new Error(
                'Could not save the analysis to your library. Any tracks already saved are still available there.',
              ),
            ),
          );
        } else {
          fail(
            new Error(
              'The audio service returned an unexpected response. Please try again.',
            ),
          );
        }
      } catch {
        fail(
          new Error(
            'The audio service returned an unreadable response. Please try again.',
          ),
        );
      }
    };
  });
}
