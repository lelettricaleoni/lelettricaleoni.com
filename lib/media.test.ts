import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/r2 builds an S3 client from environment variables at import time. The
// tests never talk to storage: they hand the functions their own `exists`.
const deleteR2Object = vi.fn(async (_key: string) => {})
const send = vi.fn(async (_command: unknown) => ({ Contents: [], NextContinuationToken: undefined }))
vi.mock('./r2', () => ({
  s3: { send: (command: unknown) => send(command) },
  R2_BUCKET: 'test-bucket',
  deleteR2Object: (key: string) => deleteR2Object(key),
  r2PublicUrl: (key: string) => `https://cdn.test/${key}`,
}))

import { resolvePhotoUrl, resolveReadyMedia, deleteMediaFiles } from './media'
import type { CacheStore } from './cache'
import type { Media } from './db'

function fakeStore() {
  const data = new Map<string, unknown>()
  const writes: string[] = []
  const store: CacheStore = {
    async get<T>(key: string) {
      return (data.has(key) ? (data.get(key) as T) : null)
    },
    async set(key, value) {
      writes.push(key)
      data.set(key, value)
      return 'OK'
    },
  }
  return { store, writes }
}

function row(over: Partial<Media>): Media {
  return {
    id: 'id', routeId: 'r', bikeModelId: null, storageKey: 'k', mediaType: 'photo',
    displayOrder: 0, altText: null, sha256: null, createdAt: new Date(0), ...over,
  }
}

beforeEach(() => {
  deleteR2Object.mockClear()
  send.mockClear()
})

describe('resolvePhotoUrl', () => {
  it('answers a photo that predates the worker without looking anything up', async () => {
    const exists = vi.fn(async () => false)
    const url = await resolvePhotoUrl('route-photos/r1/u1.jpg', exists, null)
    expect(url?.endsWith('/route-photos/r1/u1.jpg')).toBe(true)
    expect(exists).not.toHaveBeenCalled()
  })

  it('hides a staged photo whose master does not exist yet', async () => {
    const exists = vi.fn(async () => false)
    expect(await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, null)).toBeNull()
    expect(exists).toHaveBeenCalledWith('public/route-photos/r1/u1.avif')
  })

  it('shows a staged photo once its master exists', async () => {
    const url = await resolvePhotoUrl('private/route-photos/r1/u1.jpg', async () => true, null)
    expect(url?.endsWith('/public/route-photos/r1/u1.avif')).toBe(true)
  })

  it('remembers that a master exists, so the next visitor costs no storage call', async () => {
    const { store, writes } = fakeStore()
    const exists = vi.fn(async () => true)
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, store)
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', exists, store)
    expect(exists).toHaveBeenCalledTimes(1)
    expect(writes).toEqual(['img:v1:private/route-photos/r1/u1.jpg'])
  })

  it('never remembers "not yet": a photo still in the worker must appear when it is done', async () => {
    const { store, writes } = fakeStore()
    await resolvePhotoUrl('private/route-photos/r1/u1.jpg', async () => false, store)
    expect(writes).toEqual([])
  })
})

describe('resolveReadyMedia', () => {
  const resolvers = {
    hls: async (key: string) => (key.includes('ready') ? `https://cdn.test/${key}/master.m3u8` : null),
    photo: async (key: string) => (key.includes('ready') ? `https://cdn.test/${key}` : null),
  }

  it('keeps what is ready, drops what is not, and keeps the order', async () => {
    const result = await resolveReadyMedia([
      row({ id: 'a', storageKey: 'photo-ready-1' }),
      row({ id: 'b', storageKey: 'photo-pending' }),
      row({ id: 'c', storageKey: 'video-ready', mediaType: 'video' }),
      row({ id: 'd', storageKey: 'video-pending', mediaType: 'video' }),
      row({ id: 'e', storageKey: 'photo-ready-2' }),
    ], resolvers)
    expect(result.map((m) => m.id)).toEqual(['a', 'c', 'e'])
  })

  it('carries the resolved manifest on a ready video', async () => {
    const [video] = await resolveReadyMedia([row({ storageKey: 'video-ready', mediaType: 'video' })], resolvers)
    expect(video.hlsUrl).toBe('https://cdn.test/video-ready/master.m3u8')
  })

  it('returns nothing for a gallery of things still processing', async () => {
    expect(await resolveReadyMedia([row({ storageKey: 'photo-pending' })], resolvers)).toEqual([])
  })
})

describe('deleteMediaFiles', () => {
  it('removes a staged photo\'s master along with its source', async () => {
    await deleteMediaFiles({ storageKey: 'private/route-photos/r1/u1.jpg', mediaType: 'photo' })
    expect(deleteR2Object.mock.calls.map((c) => c[0]).sort()).toEqual([
      'private/route-photos/r1/u1.jpg',
      'public/route-photos/r1/u1.avif',
    ])
  })

  it('removes only the file of a photo that predates the worker', async () => {
    await deleteMediaFiles({ storageKey: 'route-photos/r1/u1.jpg', mediaType: 'photo' })
    expect(deleteR2Object.mock.calls.map((c) => c[0])).toEqual(['route-photos/r1/u1.jpg'])
  })

  it('removes a video\'s source and its whole ladder', async () => {
    await deleteMediaFiles({ storageKey: 'private/route-videos/r1/u1.mp4', mediaType: 'video' })
    expect(deleteR2Object).toHaveBeenCalledWith('private/route-videos/r1/u1.mp4')
    expect(send).toHaveBeenCalled() // the ladder is listed, then deleted, by prefix
  })
})
