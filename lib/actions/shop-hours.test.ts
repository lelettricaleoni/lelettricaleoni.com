import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ getAdminUser: vi.fn() }))
vi.mock('@/lib/shop-schedule-data', () => ({ saveWeeklyHours: vi.fn(), addClosure: vi.fn(), removeClosure: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getAdminUser } from '@/lib/supabase/server'
import * as data from '@/lib/shop-schedule-data'
import { addClosureAction, removeClosureAction, saveOpeningHoursAction } from './shop-hours'

const DAY = [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '14:00', closesAt: '19:00' }]
const week = (overrides: Record<number, unknown> = {}) => ({ days: [0, 1, 2, 3, 4, 5, 6].map((i) => overrides[i] ?? DAY) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin' } as never)
})

describe('saveOpeningHoursAction', () => {
  it('refuses anyone who is not an admin, before looking at the input', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(saveOpeningHoursAction(week())).rejects.toThrow('Unauthorized')
    expect(data.saveWeeklyHours).not.toHaveBeenCalled()
  })

  it('saves a good week, Monday first: the seven days become the weekdays 1 to 7', async () => {
    expect(await saveOpeningHoursAction(week({ 6: [] }))).toEqual({ status: 'saved' })
    expect(data.saveWeeklyHours).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(data.saveWeeklyHours).mock.calls[0][0]
    expect(Object.keys(saved)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(saved[1]).toEqual(DAY)
    expect(saved[7]).toEqual([])
  })

  it.each([
    ['a time without the leading zero', week({ 0: [{ opensAt: '9:00', closesAt: '13:00' }] })],
    ['a time that is not a time', week({ 0: [{ opensAt: '25:00', closesAt: '26:00' }] })],
    ['seconds', week({ 0: [{ opensAt: '09:00:00', closesAt: '13:00:00' }] })],
    ['six days', { days: [DAY, DAY, DAY, DAY, DAY, DAY] }],
    ['eight days', { days: [DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY] }],
    ['nothing', undefined],
    ['too many ranges in a day', week({ 0: Array.from({ length: 7 }, () => ({ opensAt: '09:00', closesAt: '10:00' })) })],
  ])('answers invalid for %s, and writes nothing', async (_name, input) => {
    expect((await saveOpeningHoursAction(input)).status).toBe('invalid')
    expect(data.saveWeeklyHours).not.toHaveBeenCalled()
  })

  it('answers invalid, saying why, for a range that closes before it opens and for ranges that overlap', async () => {
    const backwards = await saveOpeningHoursAction(week({ 2: [{ opensAt: '13:00', closesAt: '09:00' }] }))
    expect(backwards).toMatchObject({ status: 'invalid', message: expect.stringMatching(/before it closes/) })
    const overlapping = await saveOpeningHoursAction(week({ 2: [{ opensAt: '09:00', closesAt: '14:00' }, { opensAt: '13:00', closesAt: '19:00' }] }))
    expect(overlapping).toMatchObject({ status: 'invalid', message: expect.stringMatching(/overlap/) })
    expect(data.saveWeeklyHours).not.toHaveBeenCalled()
  })
})

describe('addClosureAction', () => {
  const closure = (overrides: Record<string, unknown> = {}) => ({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: 'Christmas', ...overrides })

  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(addClosureAction(closure())).rejects.toThrow('Unauthorized')
    expect(data.addClosure).not.toHaveBeenCalled()
  })

  it('adds a closure with its last day as given, and a blank reason as none', async () => {
    expect(await addClosureAction(closure())).toEqual({ status: 'added' })
    expect(data.addClosure).toHaveBeenCalledWith({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: 'Christmas' })
    await addClosureAction(closure({ reason: '   ' }))
    expect(data.addClosure).toHaveBeenLastCalledWith({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: null })
    await addClosureAction(closure({ lastDay: '2031-12-24', reason: undefined }))
    expect(data.addClosure).toHaveBeenLastCalledWith({ startsOn: '2031-12-24', lastDay: '2031-12-24', reason: null })
  })

  it.each([
    ['a last day before the first', closure({ lastDay: '2031-12-23' })],
    ['an impossible date', closure({ startsOn: '2031-02-30' })],
    ['a date written the wrong way', closure({ startsOn: '24/12/2031' })],
    ['a reason that is far too long', closure({ reason: 'x'.repeat(201) })],
    ['nothing', null],
  ])('answers invalid for %s, and writes nothing', async (_name, input) => {
    expect((await addClosureAction(input)).status).toBe('invalid')
    expect(data.addClosure).not.toHaveBeenCalled()
  })
})

describe('removeClosureAction', () => {
  it('refuses anyone who is not an admin', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null as never)
    await expect(removeClosureAction(crypto.randomUUID())).rejects.toThrow('Unauthorized')
    expect(data.removeClosure).not.toHaveBeenCalled()
  })

  it('removes the closure it is given, and nothing for an id that is not one', async () => {
    const id = crypto.randomUUID()
    expect(await removeClosureAction(id)).toEqual({ status: 'removed' })
    expect(data.removeClosure).toHaveBeenCalledWith(id)
    expect(await removeClosureAction('not-an-id')).toEqual({ status: 'invalid' })
    expect(data.removeClosure).toHaveBeenCalledTimes(1)
  })
})
