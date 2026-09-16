'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useSoulseekJobs } from './use-soulseek-jobs';

type SoulseekJobs = ReturnType<typeof useSoulseekJobs>;

const SoulseekJobsContext = createContext<SoulseekJobs | null>(null);

/**
 * Held by the dashboard layout, so moving between pages does not abandon a
 * download: the transfer would finish in the backend while nothing was left
 * listening to write it into the library.
 */
export function SoulseekJobsProvider({ children }: { children: ReactNode }) {
  const jobs = useSoulseekJobs();

  return (
    <SoulseekJobsContext.Provider value={jobs}>
      {children}
    </SoulseekJobsContext.Provider>
  );
}

export function useSoulseek(): SoulseekJobs {
  const jobs = useContext(SoulseekJobsContext);
  if (!jobs) {
    throw new Error('useSoulseek must be used inside SoulseekJobsProvider');
  }
  return jobs;
}
