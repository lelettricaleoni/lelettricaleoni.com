// worker/jobs/renditions.ts
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { RENDITION_WIDTHS, isMasterKey, photoRenditionKey } from '@/lib/media/keys'
import { cutRenditions } from '../imaging'
import { MASTER_CACHE_CONTROL } from './photo'
import { jobTarget } from './target'
import type { JobDeps, MediaJob } from './types'

/**
 * Backfill: responsive renditions for masters that were produced without them (and, later, "reprocess" for a photo).
 * The sources of those masters are long deleted, so the renditions are cut from the master itself. It only ever adds
 * objects: it never deletes, and it never touches anything that is not a master.
 */
export function createRenditionsHandler({ store, config, log }: JobDeps) {
  return async function renderRenditions(job: MediaJob): Promise<{ width: number; height: number }> {
    // Checked before anything is read or written, whatever ends up in this queue.
    const { bucket, key } = jobTarget(job, config, 'a master', isMasterKey)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const master = join(workdir, 'master.avif')
    const paths = Object.fromEntries(RENDITION_WIDTHS.map((width) => [width, join(workdir, `w${width}.avif`)]))

    await rm(workdir, { recursive: true, force: true })
    await mkdir(workdir, { recursive: true })
    try {
      log.info({ bucket, key }, 'renditions: downloading master')
      await store.download(bucket, key, master)
      const size = await cutRenditions(master, paths, config.imaging)

      // Largest first: the smallest goes up last, and its presence marks the job as done.
      for (const width of [...RENDITION_WIDTHS].sort((a, b) => b - a)) {
        await store.upload(bucket, photoRenditionKey(key, width), paths[width], {
          contentType: 'image/avif',
          cacheControl: MASTER_CACHE_CONTROL,
        })
      }
      log.info({ bucket, key }, 'renditions: done')
      return size
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
