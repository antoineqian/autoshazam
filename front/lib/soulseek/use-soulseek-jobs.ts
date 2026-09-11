'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useSWR from 'swr';
import { identity } from '@/lib/tracks/library-model';
import { recordDownloadAction } from './actions';
import {
  SoulseekApiError,
  chooseCandidate,
  createJob,
  getJob,
  getSoulseekStatus,
  retryItem,
  skipItem,
} from './client';
import { isActive } from './types';
import type { DownloadPreferences } from './preferences';
import type { Candidate, Item, Job, JobItemInput } from './types';

const POLL_MS = 2_000;
// Review items only change when the user acts, so polling can relax.
const REVIEW_POLL_MS = 10_000;

export type DownloadRequest = JobItemInput & { sourceId?: number | null };

type TrackRef = { title: string; subtitle: string };

export type ItemWithJob = Item & { jobId: string };

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Unknown error';

/**
 * Owns every Soulseek job started from the library. One item stands for a
 * track in every group it appears in, keyed like identity() in library-model,
 * so a track downloaded from one mix stops looking missing in another.
 */
export function useSoulseekJobs({
  onDownloaded,
}: {
  onDownloaded: (item: Item) => void;
}) {
  const { data: status } = useSWR('soulseek-status', getSoulseekStatus, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const sourceIds = useRef(new Map<string, number | null>());
  const notified = useRef(new Set<string>());
  const onDownloadedRef = useRef(onDownloaded);
  onDownloadedRef.current = onDownloaded;

  // Later jobs win: a track re-requested after a skip or failure should show
  // its new state, not the old one.
  const itemsByTrack = useMemo(() => {
    const map = new Map<string, ItemWithJob>();
    for (const job of jobs) {
      for (const item of job.items) {
        map.set(identity(item), { ...item, jobId: job.id });
      }
    }
    return map;
  }, [jobs]);

  const itemFor = useCallback(
    (track: TrackRef) => itemsByTrack.get(identity(track)),
    [itemsByTrack]
  );

  const replaceItem = (jobId: string, item: Item) =>
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? { ...job, items: job.items.map((it) => (it.id === item.id ? item : it)) }
          : job
      )
    );

  const failRemaining = (jobId: string, error: string) =>
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? {
              ...job,
              items: job.items.map((item) =>
                isActive(item.status)
                  ? { ...item, status: 'failed', error }
                  : item
              ),
            }
          : job
      )
    );

  const activeJobIds = useMemo(
    () =>
      jobs
        .filter((job) => job.items.some((item) => isActive(item.status)))
        .map((job) => job.id),
    [jobs]
  );

  const onlyReviewLeft = useMemo(
    () =>
      jobs.every((job) =>
        job.items.every(
          (item) => !isActive(item.status) || item.status === 'review'
        )
      ),
    [jobs]
  );

  const activeKey = activeJobIds.join(',');

  useEffect(() => {
    if (!activeKey) {
      return;
    }
    const ids = activeKey.split(',');
    let cancelled = false;

    const poll = async () => {
      await Promise.all(
        ids.map(async (jobId) => {
          try {
            const job = await getJob(jobId);
            if (!cancelled) {
              setJobs((current) =>
                current.map((it) => (it.id === jobId ? job : it))
              );
            }
          } catch (err) {
            if (cancelled) return;
            if (err instanceof SoulseekApiError && err.status === 404) {
              // The backend purged the job (or restarted). Nothing more will
              // happen to those items, so stop waiting for them.
              failRemaining(jobId, 'The backend lost track of this job');
              toast.error('Soulseek job was lost, remaining tracks marked failed');
            } else {
              console.error('Failed to poll Soulseek job', err);
            }
          }
        })
      );
    };

    const timer = setInterval(poll, onlyReviewLeft ? REVIEW_POLL_MS : POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeKey, onlyReviewLeft]);

  // Side effects of an item reaching a terminal state, run once per item and
  // state so a retried item can notify again when it settles.
  useEffect(() => {
    for (const job of jobs) {
      for (const item of job.items) {
        const key = `${item.id}:${item.status}`;
        if (notified.current.has(key)) continue;

        if (item.status === 'done') {
          notified.current.add(key);
          toast.success(`Downloaded ${item.subtitle} - ${item.title}`);
          onDownloadedRef.current(item);
          recordDownloadAction({
            title: item.title,
            subtitle: item.subtitle,
            sourceId: sourceIds.current.get(identity(item)) ?? null,
            localPath: item.localPath ?? '',
            remoteUser: item.chosen?.username ?? null,
            format: item.chosen?.extension ?? null,
            bitrate: item.chosen?.bitrate ?? null,
            matchScore: item.chosen?.matchScore ?? null,
          }).catch((err) => {
            console.error('Failed to record download', err);
            toast.error(
              `Downloaded ${item.title} but could not save it to the library`
            );
          });
        } else if (item.status === 'failed') {
          notified.current.add(key);
          toast.error(
            `Download failed: ${item.subtitle} - ${item.title}${
              item.error ? ` (${item.error})` : ''
            }`
          );
        }
      }
    }
  }, [jobs]);

  const startDownload = useCallback(
    async (items: DownloadRequest[], preferences: DownloadPreferences) => {
      if (items.length === 0) return;

      for (const item of items) {
        sourceIds.current.set(identity(item), item.sourceId ?? null);
      }

      try {
        const job = await createJob(
          items.map(({ title, subtitle, sourceLabel }) => ({
            title,
            subtitle,
            sourceLabel,
          })),
          preferences
        );
        setJobs((current) => [...current, job]);
      } catch (err) {
        console.error('Failed to start Soulseek download', err);
        toast.error(`Could not start download: ${errorMessage(err)}`);
      }
    },
    []
  );

  const act = async (
    item: ItemWithJob,
    call: () => Promise<Item>,
    failure: string
  ) => {
    try {
      replaceItem(item.jobId, await call());
    } catch (err) {
      console.error(failure, err);
      toast.error(`${failure}: ${errorMessage(err)}`);
    }
  };

  const choose = (item: ItemWithJob, candidate: Candidate) =>
    act(
      item,
      () => chooseCandidate(item.jobId, item.id, candidate),
      'Could not start that download'
    );

  const skip = (item: ItemWithJob) =>
    act(item, () => skipItem(item.jobId, item.id), 'Could not skip that track');

  const retry = (item: ItemWithJob) =>
    act(item, () => retryItem(item.jobId, item.id), 'Could not retry that track');

  return { status, startDownload, itemFor, choose, skip, retry };
}
