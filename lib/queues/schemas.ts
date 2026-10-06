// lib/queues/schemas.ts
import { z } from 'zod'

/** Where a job stands. Photos report the same phases as videos, `transcoding` included for a photo being encoded. */
export const JOB_PHASES = ['queued', 'downloading', 'transcoding', 'uploading', 'done', 'failed'] as const

/** What a job is about: one object in one bucket. */
export const MediaJobData = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1),
})
export type MediaJobData = z.infer<typeof MediaJobData>

/** What the worker writes with `job.updateProgress`, and what the site reads back. */
export const JobProgress = z.object({
  phase: z.enum(JOB_PHASES),
  percent: z.number().min(0).max(100).optional(),
  attempt: z.number().int().positive().optional(),
  error: z.string().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  updatedAt: z.number(),
})
export type JobProgress = z.infer<typeof JobProgress>
