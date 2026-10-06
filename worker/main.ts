// worker/main.ts
import { writeFile } from 'node:fs/promises'
import { Redis } from 'ioredis'
import { QUEUE_KINDS, queuePrefix } from '@/lib/queues/names'
import { loadConfig } from './config'
import { healthFilePath, runHealthBeat } from './health'
import { createPhotoHandler } from './jobs/photo'
import { createRenditionsHandler } from './jobs/renditions'
import { createVideoHandler } from './jobs/video'
import { log } from './logger'
import { createQueues, startWorkers } from './runtime'
import { scanOnce, startScanner } from './scan'
import { selfCheck } from './selfcheck'
import { s3Store } from './storage'

/** Docker's health check reads the age of this file. */
const HEALTH_FILE = healthFilePath()
const HEALTH_INTERVAL_MS = 15_000

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

async function main(): Promise<void> {
  // Configuration first, so that a missing variable is named before anything else is attempted.
  const config = loadConfig()

  const problems = await selfCheck()
  if (process.argv.includes('--check')) {
    for (const problem of problems) log.error(problem)
    if (problems.length > 0) process.exit(1)
    log.info('check passed')
    return
  }
  if (problems.length > 0) throw new Error(`The worker cannot run here: ${problems.join('; ')}`)

  const store = s3Store(config.r2)
  // BullMQ needs null here: its blocking commands are not retried and failed on a timer.
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
  const prefix = queuePrefix(config.appEnv)
  const deps = { store, config, log }

  const queues = createQueues(connection, prefix)
  const workers = startWorkers(
    connection,
    prefix,
    { video: createVideoHandler(deps), photo: createPhotoHandler(deps), renditions: createRenditionsHandler(deps) },
    log,
  )

  const stop = new AbortController()
  const scanner = startScanner(
    async () => {
      try {
        const queued = await scanOnce(queues, store, config.buckets, log)
        if (queued > 0) log.info({ queued }, 'scan: queued work the site had not handed over')
      } catch (err) {
        log.error({ err: message(err) }, 'scan failed')
      }
    },
    config.scanIntervalS * 1000,
    stop.signal,
  )
  const health = runHealthBeat({
    ping: async () => (await connection.ping()) === 'PONG',
    write: () => writeFile(HEALTH_FILE, String(Date.now())),
    intervalMs: HEALTH_INTERVAL_MS,
    signal: stop.signal,
  })

  log.info({ env: config.appEnv, prefix, buckets: config.buckets }, 'worker started')

  await new Promise<void>((resolve) => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => resolve())
  })

  // close() waits for the job in progress: a transcode is not cut in half by a deploy. If the process is killed anyway,
  // the source is still in the bucket and the queue retries.
  log.info('shutting down: waiting for the job in progress')
  stop.abort()
  await Promise.all(QUEUE_KINDS.map((kind) => workers[kind].close()))
  await Promise.all(QUEUE_KINDS.map((kind) => queues[kind].close()))
  connection.disconnect()
  await Promise.all([scanner, health])
  log.info('stopped')
}

main().catch((err) => {
  log.fatal({ err: message(err) }, 'worker crashed')
  process.exit(1)
})
