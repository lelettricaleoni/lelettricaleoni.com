// worker/progress.ts
import type { JobProgress } from '@/lib/queues/schemas'

export interface ProgressTarget {
  updateProgress(value: object): Promise<void>
}

/**
 * What a job writes as it goes. The site reads it back (lib/queues/status.ts) to draw the bar, so the shape is
 * JobProgress and nothing else.
 */
export function progressReporter(job: ProgressTarget, attempt: number) {
  return (phase: JobProgress['phase'], extra: { percent?: number; sha256?: string } = {}): Promise<void> =>
    job.updateProgress({ phase, attempt, updatedAt: Date.now(), ...extra })
}
