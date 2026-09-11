'use client';

import { useEffect, useState, useTransition } from 'react';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { getSoulseekStatus } from '@/lib/soulseek/client';
import {
  getDownloadPreferencesAction,
  saveDownloadPreferencesAction,
} from '@/lib/soulseek/actions';
import {
  DEFAULT_DOWNLOAD_PREFERENCES,
  DOWNLOAD_FORMATS,
  MP3_BITRATES,
} from '@/lib/soulseek/preferences';
import type {
  DownloadFormat,
  DownloadPreferences,
  Mp3Bitrate,
} from '@/lib/soulseek/preferences';

/** Enabled formats first, in priority order, then the rest in default order. */
function orderFormats(priority: DownloadFormat[]): DownloadFormat[] {
  return [
    ...priority,
    ...DOWNLOAD_FORMATS.filter((format) => !priority.includes(format)),
  ];
}

export function DownloadPreferencesCard() {
  const { data: saved } = useSWR('download-preferences', () =>
    getDownloadPreferencesAction()
  );
  const { data: status } = useSWR('soulseek-status', getSoulseekStatus, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [order, setOrder] = useState<DownloadFormat[]>(
    orderFormats(DEFAULT_DOWNLOAD_PREFERENCES.formatPriority)
  );
  const [enabled, setEnabled] = useState<Set<DownloadFormat>>(
    new Set(DEFAULT_DOWNLOAD_PREFERENCES.formatPriority)
  );
  const [minMp3Bitrate, setMinMp3Bitrate] = useState<Mp3Bitrate | null>(
    DEFAULT_DOWNLOAD_PREFERENCES.minMp3Bitrate
  );
  const [autoDownload, setAutoDownload] = useState(
    DEFAULT_DOWNLOAD_PREFERENCES.autoDownload
  );
  const [message, setMessage] = useState<{
    error?: string;
    success?: string;
  }>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!saved) return;
    setOrder(orderFormats(saved.formatPriority));
    setEnabled(new Set(saved.formatPriority));
    setMinMp3Bitrate(saved.minMp3Bitrate);
    setAutoDownload(saved.autoDownload);
  }, [saved]);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggle = (format: DownloadFormat) =>
    setEnabled((current) => {
      const next = new Set(current);
      next.has(format) ? next.delete(format) : next.add(format);
      return next;
    });

  const save = () => {
    const prefs: DownloadPreferences = {
      formatPriority: order.filter((format) => enabled.has(format)),
      minMp3Bitrate,
      autoDownload,
    };
    setMessage({});
    startTransition(async () => {
      try {
        await saveDownloadPreferencesAction(prefs);
        setMessage({ success: 'Preferences saved.' });
      } catch (err) {
        setMessage({
          error: err instanceof Error ? err.message : 'Could not save',
        });
      }
    });
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Soulseek downloads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {status && !status.configured && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Soulseek is not configured. Requires{' '}
            <code className="font-mono text-xs">SOULSEEK_ACCOUNT</code> and{' '}
            <code className="font-mono text-xs">SOULSEEK_PASSWORD</code> on the
            backend.
          </p>
        )}

        <div>
          <Label className="mb-2">Format priority</Label>
          <p className="mb-2 text-sm text-gray-500">
            Enabled formats are searched for in this order.
          </p>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {order.map((format, index) => {
              const on = enabled.has(format);
              return (
                <li
                  key={format}
                  className="flex items-center gap-3 px-3 py-1.5 text-sm"
                >
                  <input
                    id={`format-${format}`}
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(format)}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <label
                    htmlFor={`format-${format}`}
                    className={`flex-1 cursor-pointer font-mono uppercase ${
                      on ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {format}
                  </label>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                    <span className="sr-only">Move {format} up</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    title="Move down"
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                    <span className="sr-only">Move {format} down</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <Label htmlFor="min-mp3-bitrate" className="mb-2">
            Minimum MP3 bitrate
          </Label>
          <select
            id="min-mp3-bitrate"
            value={minMp3Bitrate ?? 'any'}
            onChange={(e) =>
              setMinMp3Bitrate(
                e.target.value === 'any'
                  ? null
                  : (Number(e.target.value) as Mp3Bitrate)
              )
            }
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {MP3_BITRATES.map((bitrate) => (
              <option key={bitrate} value={bitrate}>
                {bitrate} kbps
              </option>
            ))}
            <option value="any">Any</option>
          </select>
          <p className="mt-1 text-sm text-gray-500">
            A VBR file counts as its reported average bitrate.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={autoDownload}
            onChange={(e) => setAutoDownload(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          <span>
            <span className="font-medium text-gray-900">
              Download automatically when confident
            </span>
            <br />
            <span className="text-gray-500">
              When off, every match waits for you to pick a file.
            </span>
          </span>
        </label>

        {message.error && (
          <p className="text-red-500 text-sm">{message.error}</p>
        )}
        {message.success && (
          <p className="text-green-500 text-sm">{message.success}</p>
        )}

        <Button
          type="button"
          onClick={save}
          className="bg-orange-500 hover:bg-orange-600 text-white"
          disabled={isPending || enabled.size === 0}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Preferences'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
