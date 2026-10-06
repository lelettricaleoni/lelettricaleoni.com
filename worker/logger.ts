// worker/logger.ts
import pino from 'pino'

/** Structured JSON on stdout: `docker logs` reads it, and so can anything that parses lines. */
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
export type Logger = pino.Logger
