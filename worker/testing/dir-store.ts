// worker/testing/dir-store.ts
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MissingObjectError, type ObjectStore } from '../storage'

export interface UploadRecord {
  bucket: string
  key: string
  contentType: string
  cacheControl?: string
}

/** An ObjectStore over a folder (one subfolder per bucket), for tests. Remembers what was uploaded and in which order. */
export function dirStore(root: string): ObjectStore & { uploads: UploadRecord[]; removed: string[] } {
  const uploads: UploadRecord[] = []
  const removed: string[] = []
  const pathOf = (bucket: string, key: string) => join(root, bucket, ...key.split('/'))

  async function exists(bucket: string, key: string): Promise<boolean> {
    try {
      return (await stat(pathOf(bucket, key))).isFile()
    } catch {
      return false
    }
  }

  async function walk(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const found: string[] = []
    for (const entry of entries) {
      const key = prefix + entry.name
      if (entry.isDirectory()) found.push(...(await walk(join(dir, entry.name), key + '/')))
      else found.push(key)
    }
    return found
  }

  return {
    uploads,
    removed,
    exists,
    async list(bucket, prefix) {
      return (await walk(join(root, bucket), '')).filter((key) => key.startsWith(prefix)).sort()
    },
    async download(bucket, key, destPath) {
      if (!(await exists(bucket, key))) throw new MissingObjectError(`${bucket}/${key}`)
      await mkdir(dirname(destPath), { recursive: true })
      await cp(pathOf(bucket, key), destPath)
    },
    async upload(bucket, key, srcPath, options) {
      const target = pathOf(bucket, key)
      await mkdir(dirname(target), { recursive: true })
      await cp(srcPath, target)
      uploads.push({ bucket, key, ...options })
    },
    async remove(bucket, key) {
      await rm(pathOf(bucket, key), { force: true })
      removed.push(`${bucket}/${key}`)
    },
  }
}
