// worker/testing/dir-store.test.ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MissingObjectError } from '../storage'
import { dirStore } from './dir-store'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'store-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function put(bucket: string, key: string, content: string) {
  const file = join(root, bucket, ...key.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

describe('dirStore', () => {
  it('knows which objects exist', async () => {
    await put('b', 'private/route-photos/r/u.jpg', 'x')
    const store = dirStore(root)
    expect(await store.exists('b', 'private/route-photos/r/u.jpg')).toBe(true)
    expect(await store.exists('b', 'private/route-photos/r/other.jpg')).toBe(false)
    expect(await store.exists('other-bucket', 'private/route-photos/r/u.jpg')).toBe(false)
  })

  it('lists keys under a prefix, in order, across folders', async () => {
    await put('b', 'private/route-photos/r1/b.jpg', 'x')
    await put('b', 'private/route-photos/r1/a.jpg', 'x')
    await put('b', 'private/route-photos/r2/c.png', 'x')
    await put('b', 'public/route-photos/r1/u.avif', 'x')
    expect(await dirStore(root).list('b', 'private/route-photos/')).toEqual([
      'private/route-photos/r1/a.jpg',
      'private/route-photos/r1/b.jpg',
      'private/route-photos/r2/c.png',
    ])
    expect(await dirStore(root).list('missing-bucket', 'private/')).toEqual([])
  })

  it('downloads a copy, and says so with MissingObjectError when there is nothing to download', async () => {
    await put('b', 'k/file.bin', 'hello')
    const store = dirStore(root)
    const dest = join(root, 'out', 'copy.bin')
    await store.download('b', 'k/file.bin', dest)
    expect(await readFile(dest, 'utf8')).toBe('hello')
    await expect(store.download('b', 'k/none.bin', dest)).rejects.toBeInstanceOf(MissingObjectError)
  })

  it('records every upload, in order, with its headers, and stores the content', async () => {
    const source = join(root, 'src.avif')
    await writeFile(source, 'avif')
    const store = dirStore(root)
    await store.upload('b', 'public/x/u.w480.avif', source, { contentType: 'image/avif', cacheControl: 'immutable' })
    await store.upload('b', 'public/x/u.avif', source, { contentType: 'image/avif' })
    expect(store.uploads).toEqual([
      { bucket: 'b', key: 'public/x/u.w480.avif', contentType: 'image/avif', cacheControl: 'immutable' },
      { bucket: 'b', key: 'public/x/u.avif', contentType: 'image/avif' },
    ])
    expect(await store.exists('b', 'public/x/u.avif')).toBe(true)
  })

  it('removes an object and remembers having done so', async () => {
    await put('b', 'k/f', 'x')
    const store = dirStore(root)
    await store.remove('b', 'k/f')
    expect(await store.exists('b', 'k/f')).toBe(false)
    expect(store.removed).toEqual(['b/k/f'])
  })
})
