import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('@/lib/db', () => ({}))
vi.mock('@/lib/reservations', () => ({ deleteBikeUnitUnlessReserved: vi.fn() }))

import { updateTag } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { deleteBikeUnitUnlessReserved } from '@/lib/reservations'
import { deleteBikeUnitAction } from './bike-units'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin' } as never)
})

describe('deleteBikeUnitAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(deleteBikeUnitAction('unit-1')).rejects.toThrow('Unauthorized')
    expect(deleteBikeUnitUnlessReserved).not.toHaveBeenCalled()
  })

  it('answers instead of throwing when the bike has reservations, and does not touch the cache', async () => {
    vi.mocked(deleteBikeUnitUnlessReserved).mockResolvedValue({ status: 'has_reservations' })
    expect(await deleteBikeUnitAction('unit-1')).toEqual({ ok: false, reason: 'has_reservations' })
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('deletes a bike without reservations and refreshes the cached bike list', async () => {
    vi.mocked(deleteBikeUnitUnlessReserved).mockResolvedValue({ status: 'deleted' })
    expect(await deleteBikeUnitAction('unit-1')).toEqual({ ok: true })
    expect(updateTag).toHaveBeenCalledWith('bike-units')
  })
})
