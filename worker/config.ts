// worker/config.ts
import { z } from 'zod'

/**
 * Everything the worker reads from its environment, parsed once at start. A missing or malformed value stops the
 * process with the name of the variable, instead of failing on the first photo.
 */
const Env = z.object({
  APP_ENV: z.enum(['production', 'staging']),
  REDIS_URL: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKETS: z
    .string()
    .transform((value) => value.split(',').map((bucket) => bucket.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1)),
  WORKDIR_BASE: z.string().default('/tmp/work'),
  SCAN_INTERVAL_S: z.coerce.number().int().positive().default(600),
  IMAGE_MAX_EDGE: z.coerce.number().int().positive().default(2400),
  IMAGE_QUALITY: z.coerce.number().int().min(1).max(100).default(65),
  IMAGE_EFFORT: z.coerce.number().int().min(0).max(9).default(3),
  IMAGE_SHARE_EDGE: z.coerce.number().int().positive().default(1200),
  IMAGE_SHARE_QUALITY: z.coerce.number().int().min(1).max(100).default(82),
  LOG_LEVEL: z.string().default('info'),
})

export interface ImagingConfig {
  maxEdge: number
  quality: number
  /** CPU effort of the AVIF encoder, 0 (fastest) to 9. 3 is the speed 6 of the Pillow encoder this replaced (effort = 9 - speed). */
  effort: number
  shareEdge: number
  shareQuality: number
}

export interface WorkerConfig {
  appEnv: 'production' | 'staging'
  redisUrl: string
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string }
  buckets: string[]
  workdirBase: string
  scanIntervalS: number
  imaging: ImagingConfig
  logLevel: string
}

export function loadConfig(env: Record<string, string | undefined> = process.env): WorkerConfig {
  const parsed = Env.safeParse(env)
  if (!parsed.success) throw new Error(`Invalid worker environment:\n${z.prettifyError(parsed.error)}`)
  const e = parsed.data
  return {
    appEnv: e.APP_ENV,
    redisUrl: e.REDIS_URL,
    r2: { accountId: e.R2_ACCOUNT_ID, accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
    buckets: e.R2_BUCKETS,
    workdirBase: e.WORKDIR_BASE,
    scanIntervalS: e.SCAN_INTERVAL_S,
    imaging: {
      maxEdge: e.IMAGE_MAX_EDGE,
      quality: e.IMAGE_QUALITY,
      effort: e.IMAGE_EFFORT,
      shareEdge: e.IMAGE_SHARE_EDGE,
      shareQuality: e.IMAGE_SHARE_QUALITY,
    },
    logLevel: e.LOG_LEVEL,
  }
}
