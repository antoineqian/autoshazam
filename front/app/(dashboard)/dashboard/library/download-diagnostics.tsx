'use client';

import { useState } from 'react';
import copy from 'clipboard-copy';
import { Info } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Item } from '@/lib/soulseek/types';

export function DownloadDiagnostics({ item }: { item: Item }) {
  const [copyStatus, setCopyStatus] = useState('Copy diagnostics');
  const history = item.attemptHistory ?? [];

  async function copyDetails() {
    try {
      await copy(JSON.stringify({
        capturedAt: new Date().toISOString(),
        jobId: item.jobId, itemId: item.id,
        title: item.title, artist: item.subtitle,
        status: item.status, query: item.queryUsed,
        progress: item.progress, error: item.error,
        attempts: item.attempts, maxAttempts: item.maxAttempts,
        chosen: item.chosen, attemptHistory: history,
      }, null, 2));
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Could not copy — try again');
    }
  }

  return (
    <DropdownMenu onOpenChange={() => setCopyStatus('Copy diagnostics')}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded p-1 text-gray-500 hover:bg-gray-100"
          aria-label={`Download details for ${item.title}`} title="Download details">
          <Info className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[90vw] border-gray-200 bg-white p-3">
        <p className="text-sm font-medium text-gray-900">Download details</p>
        <p className="mt-1 break-words text-xs text-gray-600">{item.subtitle} — {item.title}</p>
        {item.error && <p className="mt-2 break-words text-xs text-red-700">{item.error}</p>}
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto text-xs text-gray-600">
          {history.length === 0 && <p>No transfer details available for this job.</p>}
          {history.map((attempt, index) => (
            <div key={`${attempt.run}:${attempt.attempt}:${index}`} className="space-y-1 border-t pt-2">
              <p className="break-words font-medium text-gray-900">
                Run {attempt.run}, attempt {attempt.attempt}: {attempt.peer}
              </p>
              <p>State: {attempt.state} · {Math.round(attempt.elapsedSeconds)}s</p>
              <p>{attempt.bytesReceived.toLocaleString()} / {attempt.totalBytes.toLocaleString()} bytes</p>
              {attempt.queuePosition != null && <p>Reported queue position: {attempt.queuePosition}</p>}
              <p>Peer advertised {attempt.advertisedQueueSize.toLocaleString()} queued files
                {' · '}{attempt.advertisedFreeSlots ? 'free slot' : 'no free slot'}</p>
              <p className="break-all">{attempt.remotePath}</p>
              {attempt.error && <p className="break-words text-red-700">{attempt.error}</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 break-all font-mono text-[10px] text-gray-400">
          Job {item.jobId ?? 'unknown'} · Item {item.id}
        </p>
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          void copyDetails();
        }} className="mt-2 cursor-pointer rounded border px-2 py-1 text-xs focus:bg-gray-50">
          {copyStatus}
        </DropdownMenuItem>
        <span className="sr-only" role="status">{copyStatus}</span>
        <p className="mt-1 text-[10px] text-gray-500">
          Includes track names, peer usernames and remote file paths.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
