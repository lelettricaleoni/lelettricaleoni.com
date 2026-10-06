// worker/jobs/types.ts
/** The part of a BullMQ job the handlers use, so that tests can hand them a plain object. */
export interface MediaJob {
  data: unknown
  attemptsMade: number
  opts: { attempts?: number }
  updateProgress(value: object): Promise<void>
}
