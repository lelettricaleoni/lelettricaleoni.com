// lib/actions/media-jobs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminUser = vi.fn()
const enqueueMediaJob = vi.fn(async (..._args: unknown[]) => 'queued')
const readJobStatus = vi.fn(async (..._args: unknown[]): Promise<unknown> => null)

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: () => getAdminUser() }))
vi.mock('@/lib/queues/enqueue', () => ({ enqueueMediaJob: (...args: unknown[]) => enqueueMediaJob(...args) }))
vi.mock('@/lib/queues/status', () => ({ readJobStatus: (...args: unknown[]) => readJobStatus(...args) }))

import { confirmMediaUpload, getMediaJobStatuses } from './media-jobs'

beforeEach(() => {
  getAdminUser.mockReset()
  enqueueMediaJob.mockClear()
  readJobStatus.mockReset()
  readJobStatus.mockResolvedValue(null)
})

describe('confirmMediaUpload', () => {
  it('hands the uploaded file to the worker when the admin confirms it', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    await confirmMediaUpload('private/route-photos/r1/u1.jpg')
    expect(enqueueMediaJob).toHaveBeenCalledWith('private/route-photos/r1/u1.jpg')
  })

  it('does nothing for someone who is not an admin', async () => {
    getAdminUser.mockResolvedValue(null)
    await confirmMediaUpload('private/route-photos/r1/u1.jpg')
    expect(enqueueMediaJob).not.toHaveBeenCalled()
  })

  it('does nothing for a key the worker does not process (a GPX file, a public photo)', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    await confirmMediaUpload('route-gpx/r1/track.gpx')
    await confirmMediaUpload('public/route-photos/r1/u1.avif')
    expect(enqueueMediaJob).not.toHaveBeenCalled()
  })
})

describe('getMediaJobStatuses', () => {
  it('answers nothing to someone who is not an admin', async () => {
    getAdminUser.mockResolvedValue(null)
    expect(await getMediaJobStatuses(['private/route-photos/r1/u1.jpg'])).toEqual({})
    expect(readJobStatus).not.toHaveBeenCalled()
  })

  it('reads the status of the tracked keys only, and returns only the ones that have one', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    readJobStatus.mockImplementation(async (key: unknown) =>
      key === 'private/route-photos/r1/a.jpg' ? { phase: 'done', progress: 100, updatedAt: 1 } : null,
    )
    const result = await getMediaJobStatuses([
      'private/route-photos/r1/a.jpg',
      'private/route-photos/r1/b.jpg',
      'route-gpx/r1/track.gpx',
    ])
    expect(result).toEqual({ 'private/route-photos/r1/a.jpg': { phase: 'done', progress: 100, updatedAt: 1 } })
    expect(readJobStatus).toHaveBeenCalledTimes(2)
  })

  it('looks at no more than fifty keys at a time', async () => {
    getAdminUser.mockResolvedValue({ id: 'u' })
    const keys = Array.from({ length: 80 }, (_, i) => `private/route-photos/r1/${i}.jpg`)
    await getMediaJobStatuses(keys)
    expect(readJobStatus).toHaveBeenCalledTimes(50)
  })
})
