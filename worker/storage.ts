// worker/storage.ts
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { WorkerConfig } from './config'

/**
 * Object storage as the worker needs it. An interface, so that the jobs are tested against a folder (see
 * testing/dir-store.ts) and only this file knows about R2.
 */
export interface ObjectStore {
  exists(bucket: string, key: string): Promise<boolean>
  list(bucket: string, prefix: string): Promise<string[]>
  download(bucket: string, key: string, destPath: string): Promise<void>
  upload(
    bucket: string,
    key: string,
    srcPath: string,
    options: { contentType: string; cacheControl?: string },
  ): Promise<void>
  remove(bucket: string, key: string): Promise<void>
}

/** The object a job is about is not there: already processed by someone else, or never uploaded. */
export class MissingObjectError extends Error {
  constructor(what: string) {
    super(`Object not found: ${what}`)
    this.name = 'MissingObjectError'
  }
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof NoSuchKey ||
    (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound'))
  )
}

export function s3Store(r2: WorkerConfig['r2']): ObjectStore {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    // R2 rejects the trailing checksums newer SDKs send by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  return {
    async exists(bucket, key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (err) {
        // Only "not there" means not there. Treating any error as absence would queue work twice on a hiccup.
        if (isNotFound(err)) return false
        throw err
      }
    },

    async list(bucket, prefix) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        )
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key)
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return keys
    },

    async download(bucket, key, destPath) {
      let body: Readable
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        body = res.Body as Readable
      } catch (err) {
        if (isNotFound(err)) throw new MissingObjectError(`${bucket}/${key}`)
        throw err
      }
      await mkdir(dirname(destPath), { recursive: true })
      await pipeline(body, createWriteStream(destPath))
    },

    async upload(bucket, key, srcPath, { contentType, cacheControl }) {
      const upload = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: createReadStream(srcPath), ContentType: contentType, CacheControl: cacheControl },
        queueSize: 4,
        partSize: 8 * 1024 * 1024,
      })
      await upload.done()
    },

    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
  }
}
