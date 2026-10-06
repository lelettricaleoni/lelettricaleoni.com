// lib/queues/counts.ts
/** Sum of every count of every queue; a queue that did not answer counts as empty. For the developer page. */
export function countJobs(perQueue: (Record<string, number> | null)[]): number {
  return perQueue.reduce((sum, counts) => sum + Object.values(counts ?? {}).reduce((a, b) => a + b, 0), 0)
}
