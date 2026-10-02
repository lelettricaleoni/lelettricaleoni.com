import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('@/lib/db', () => ({}))
vi.mock('@/lib/reservations', () => ({ deleteBikeUnitUnlessReserved: vi.fn(), retireBikeUnit: vi.fn(), restoreBikeUnit: vi.fn() }))

import { updateTag } from 'next/cache'
import { getAdminUser } from '@/lib/supabase/server'
import { deleteBikeUnitUnlessReserved, retireBikeUnit, restoreBikeUnit } from '@/lib/reservations'
import { deleteBikeUnitAction, retireBikeUnitAction, restoreBikeUnitAction } from './bike-units'

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

describe('retireBikeUnitAction', () => {
  const unitId = () => crypto.randomUUID()

  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(retireBikeUnitAction({ id: unitId(), retiredOn: '2031-10-15' })).rejects.toThrow('Unauthorized')
    expect(retireBikeUnit).not.toHaveBeenCalled()
  })

  it('answers invalid for a bad day, without touching the database', async () => {
    const result = await retireBikeUnitAction({ id: unitId(), retiredOn: '2031-02-30' })
    expect(result.status).toBe('invalid')
    expect(retireBikeUnit).not.toHaveBeenCalled()
  })

  it('names what is wrong: the day, or the bike', async () => {
    expect(await retireBikeUnitAction({ id: unitId(), retiredOn: '2031-02-30' })).toEqual({ status: 'invalid', message: 'That is not a valid date' })
    expect(await retireBikeUnitAction({ id: 'nope', retiredOn: '2031-10-15' })).toEqual({ status: 'invalid', message: 'Invalid bike' })
  })

  it('retires and refreshes the cached bike lists, because the public site stops showing the bike', async () => {
    vi.mocked(retireBikeUnit).mockResolvedValue({ status: 'retired' })
    const id = unitId()
    expect(await retireBikeUnitAction({ id, retiredOn: '2031-10-15' })).toEqual({ status: 'retired' })
    expect(retireBikeUnit).toHaveBeenCalledWith(id, '2031-10-15')
    expect(updateTag).toHaveBeenCalledWith('bike-units')
  })

  it('leaves the cache alone when the retirement is refused', async () => {
    vi.mocked(retireBikeUnit).mockResolvedValue({ status: 'conflict', conflicts: [] })
    await retireBikeUnitAction({ id: unitId(), retiredOn: '2031-10-15' })
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('restoreBikeUnitAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(restoreBikeUnitAction({ id: crypto.randomUUID() })).rejects.toThrow('Unauthorized')
    expect(restoreBikeUnit).not.toHaveBeenCalled()
  })

  it('restores and refreshes the cached bike lists', async () => {
    vi.mocked(restoreBikeUnit).mockResolvedValue({ status: 'restored' })
    expect(await restoreBikeUnitAction({ id: crypto.randomUUID() })).toEqual({ status: 'restored' })
    expect(updateTag).toHaveBeenCalledWith('bike-units')
  })
})
