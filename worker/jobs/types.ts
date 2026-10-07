import type { WorkerConfig } from '../config'
import type { Logger } from '../logger'
import type { ObjectStore } from '../storage'

/** The part of a BullMQ job the handlers use, so that tests can hand them a plain object. */
export interface MediaJob {
  data: unknown
  attemptsMade: number
  opts: { attempts?: number }
  updateProgress(value: object): Promise<void>
}

/** What every job handler needs; tests pass a folder-backed store and a quiet logger. */
export interface JobDeps {
  store: ObjectStore
  config: WorkerConfig
  log: Logger
}
