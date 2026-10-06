// worker/jobs/photo.ts
import { mkdir, readFile, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { RENDITION_WIDTHS, photoMasterKeyFor, photoRenditionKey, photoShareKey } from '@/lib/media/keys'
import { MediaJobData } from '@/lib/queues/schemas'
import { sha256OfFile } from '../hash'
import { decodeHeic, isHeicKey } from '../heic'
import { renderPhoto, type PhotoOutputs } from '../imaging'
import { progressReporter } from '../progress'
import { MissingObjectError } from '../storage'
import type { JobDeps, MediaJob } from './types'

/**
 * The output name carries the source's uuid, which never repeats, so a browser or CDN may keep the file for as long as
 * it likes.
 */
export const MASTER_CACHE_CONTROL = 'public, max-age=31536000, immutable'

export interface PhotoResult {
  width?: number
  height?: number
  sha256?: string
  /** The source was already gone and the master was there: someone else finished this job. */
  skipped?: boolean
}

/**
 * Photo processing: any accepted upload in, one AVIF master out. Upload order matters: link preview, renditions from the
 * largest to the smallest, then the master, whose presence marks the photo as done. The source goes only after all of
 * that, so a failure before then leaves it where the next attempt (or scan) finds it.
 */
export function createPhotoHandler({ store, config, log }: JobDeps) {
  return async function processPhoto(job: MediaJob): Promise<PhotoResult> {
    const { bucket, key } = MediaJobData.parse(job.data)
    const attempt = job.attemptsMade + 1
    const report = progressReporter(job, attempt)
    const masterKey = photoMasterKeyFor(key)

    const workdir = join(config.workdirBase, bucket, key.replaceAll('/', '_'))
    const source = join(workdir, 'input' + extname(key))
    const outputs: PhotoOutputs = {
      master: join(workdir, 'master.avif'),
      share: join(workdir, 'share.jpg'),
      renditions: Object.fromEntries(RENDITION_WIDTHS.map((width) => [width, join(workdir, `w${width}.avif`)])),
    }

    // A folder left by an attempt that was killed must not leak into this one.
    await rm(workdir, { recursive: true, force: true })
    await mkdir(workdir, { recursive: true })

    try {
      await report('downloading')
      log.info({ bucket, key, attempt }, 'photo: downloading')
      try {
        await store.download(bucket, key, source)
      } catch (err) {
        if (err instanceof MissingObjectError && (await store.exists(bucket, masterKey))) {
          log.info({ bucket, key }, 'photo: source already processed')
          return { skipped: true }
        }
        throw err
      }

      // The only place the source exists outside R2 is here, and it is deleted below.
      const sha256 = await sha256OfFile(source)

      await report('transcoding')
      const image = isHeicKey(key) ? await decodeHeic(await readFile(source)) : source
      const { width, height } = await renderPhoto(image, outputs, config.imaging)
      log.info({ bucket, key, width, height }, 'photo: rendered')

      await report('uploading', { percent: 99 })
      const options = { contentType: 'image/avif', cacheControl: MASTER_CACHE_CONTROL }
      await store.upload(bucket, photoShareKey(key), outputs.share, { contentType: 'image/jpeg', cacheControl: MASTER_CACHE_CONTROL })
      for (const rendition of [...RENDITION_WIDTHS].sort((a, b) => b - a)) {
        await store.upload(bucket, photoRenditionKey(masterKey, rendition), outputs.renditions[rendition], options)
      }
      await store.upload(bucket, masterKey, outputs.master, options)

      await store.remove(bucket, key)
      await report('done', { percent: 100, sha256 })
      log.info({ bucket, masterKey }, 'photo: done')
      return { width, height, sha256 }
    } finally {
      await rm(workdir, { recursive: true, force: true })
    }
  }
}
