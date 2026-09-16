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

// Jobs live in the backend, so the only thing worth keeping on the client is
// how to find them again: which jobs are in flight, which source each track
// came from, and what we have already reacted to, so a restored job does not
// record its downloads a second time.
const STORAGE_KEY = 'soulseek-jobs-v1';

type Persisted = {
  jobIds: string[];
  sourceIds: Record<string, number | null>;
  notified: string[];
};

function readStored(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

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
 *
 * Mounted by the dashboard layout rather than the library page: downloads run
 * in the backend and outlive the page, and a job nobody is watching finishes
 * on disk without ever being written to the library.
 */
export function useSoulseekJobs() {
  const { data: status } = useSWR('soulseek-status', getSoulseekStatus, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  // Tracks this session has pulled down, for pages showing them as missing.
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [restored, setRestored] = useState(false);
  const sourceIds = useRef(new Map<string, number | null>());
  const notified = useRef(new Set<string>());

  // Pick up jobs left running by a previous page load before anything else.
  useEffect(() => {
    const stored = readStored();
    if (!stored) {
      setRestored(true);
      return;
    }
    for (const [key, id] of Object.entries(stored.sourceIds ?? {})) {
      sourceIds.current.set(key, id);
    }
    for (const key of stored.notified ?? []) {
      notified.current.add(key);
    }

    let cancelled = false;
    Promise.all(
      (stored.jobIds ?? []).map((id) => getJob(id).catch(() => null))
    ).then((results) => {
      if (cancelled) return;
      // A job the backend has purged is simply gone; nothing to report.
      const found = results.filter((job): job is Job => job !== null);
      const ids = new Set(found.map((job) => job.id));
      // Merge rather than replace: a job started while this was in flight
      // must not be dropped on the floor.
      setJobs((current) => [...found, ...current.filter((job) => !ids.has(job.id))]);
      setRestored(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
          setDownloaded((current) => new Set(current).add(identity(item)));
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

  // Runs after the effect above, so notified is up to date.
  useEffect(() => {
    if (!restored) return;
    const live = jobs.filter((job) =>
      job.items.some((item) => isActive(item.status))
    );
    try {
      if (live.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const keys = new Set(live.flatMap((job) => job.items.map(identity)));
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          jobIds: live.map((job) => job.id),
          sourceIds: Object.fromEntries(
            [...sourceIds.current].filter(([key]) => keys.has(key))
          ),
          notified: [...notified.current],
        } satisfies Persisted)
      );
    } catch {
      // Private mode or a full quota. Downloads still work; they just stop
      // surviving a reload.
    }
  }, [jobs, restored]);

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

  return { status, startDownload, itemFor, choose, skip, retry, downloaded };
}
