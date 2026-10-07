// worker/hash.ts
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** Streamed, not loaded whole: a source can be a multi-gigabyte video. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
