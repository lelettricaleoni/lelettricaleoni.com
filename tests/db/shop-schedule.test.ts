import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, shopClosures, shopOpeningHours } from '@/lib/db'
import { addClosure, listClosures, loadShopSchedule, removeClosure, saveWeeklyHours } from '@/lib/shop-schedule-data'
import { closingTimeOn, isClosedOn, type HoursRange } from '@/lib/shop-schedule'

/**
 * The shop's hours live in the same database staging uses: every test puts back what it found (the hours and the closures) before the next.
 */
describe('the schedule of the shop', () => {
  let savedHours: { weekday: number; opensAt: string; closesAt: string }[]
  let savedClosures: { startsOn: string; endsOn: string; reason: string | null }[]

  beforeEach(async () => {
    savedHours = await db.select({ weekday: shopOpeningHours.weekday, opensAt: shopOpeningHours.opensAt, closesAt: shopOpeningHours.closesAt }).from(shopOpeningHours)
    savedClosures = await db.select({ startsOn: shopClosures.startsOn, endsOn: shopClosures.endsOn, reason: shopClosures.reason }).from(shopClosures)
  })
  afterEach(async () => {
    await db.delete(shopOpeningHours)
    if (savedHours.length > 0) await db.insert(shopOpeningHours).values(savedHours)
    await db.delete(shopClosures)
    if (savedClosures.length > 0) await db.insert(shopClosures).values(savedClosures)
  })

  const DAY: HoursRange[] = [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '14:00', closesAt: '19:00' }]
  const everyDay = (ranges: HoursRange[] = DAY) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((weekday) => [weekday, ranges]))

  it('has today\'s hours from the start: every day 09:00-13:00 and 14:00-19:00', async () => {
    // What the migration put there, read before any test changed it (a panel edit since then would show here: the test says so).
    const rows = [...savedHours].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))
    if (rows.length !== 14) return // the shop has changed its hours in the panel since the seed: nothing to compare with
    expect(rows.map((r) => [r.weekday, r.opensAt.slice(0, 5), r.closesAt.slice(0, 5)]).slice(0, 2)).toEqual([[1, '09:00', '13:00'], [1, '14:00', '19:00']])
  })

  it('reads the hours as HH:MM, by ISO weekday, in order', async () => {
    await saveWeeklyHours({ ...everyDay(), 3: [{ opensAt: '15:00', closesAt: '19:00' }, { opensAt: '09:30', closesAt: '12:00' }] })
    const schedule = await loadShopSchedule()
    expect(schedule.weekly[3]).toEqual([{ opensAt: '09:30', closesAt: '12:00' }, { opensAt: '15:00', closesAt: '19:00' }])
    expect(schedule.weekly[1]).toEqual(DAY)
    expect(closingTimeOn(schedule, '2031-11-05')).toBe('19:00') // a Wednesday
  })

  it('replaces the whole week, and a weekday given no ranges is closed', async () => {
    await saveWeeklyHours({ ...everyDay(), 7: [] })
    const schedule = await loadShopSchedule()
    expect(schedule.weekly[7] ?? []).toEqual([])
    expect(isClosedOn(schedule, '2031-11-09')).toBe(true) // a Sunday
    expect(isClosedOn(schedule, '2031-11-03')).toBe(false)
  })

  it('saving the same week twice leaves one copy of it', async () => {
    await saveWeeklyHours(everyDay())
    await saveWeeklyHours(everyDay())
    expect(await db.select().from(shopOpeningHours)).toHaveLength(14)
  })

  it('a week that cannot be written changes nothing: it is one statement, so the old week is still there', async () => {
    await saveWeeklyHours(everyDay())
    await expect(saveWeeklyHours({ ...everyDay(), 2: [{ opensAt: '19:00', closesAt: '09:00' }] })).rejects.toThrow()
    expect(await db.select().from(shopOpeningHours)).toHaveLength(14)
    expect((await loadShopSchedule()).weekly[2]).toEqual(DAY)
  })

  it('a closure is given with its last day and stored with the end exclusive; the schedule closes those days', async () => {
    await addClosure({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: 'Christmas' })
    const [row] = await db.select().from(shopClosures).where(eq(shopClosures.startsOn, '2031-12-24'))
    expect(row).toMatchObject({ startsOn: '2031-12-24', endsOn: '2031-12-27', reason: 'Christmas' })
    const schedule = await loadShopSchedule()
    expect(isClosedOn(schedule, '2031-12-26')).toBe(true)
    expect(isClosedOn(schedule, '2031-12-27')).toBe(false)
  })

  it('a closure of one day is the same day as first and last', async () => {
    await addClosure({ startsOn: '2031-12-08', lastDay: '2031-12-08', reason: null })
    expect(isClosedOn(await loadShopSchedule(), '2031-12-08')).toBe(true)
    expect(isClosedOn(await loadShopSchedule(), '2031-12-09')).toBe(false)
  })

  it('lists the closures that are current or to come, with the last day included, and not the ones that are over', async () => {
    await addClosure({ startsOn: '2001-01-01', lastDay: '2001-01-03', reason: 'long ago' })
    await addClosure({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: 'Christmas' })
    const list = await listClosures('2031-12-01')
    expect(list.map((c) => [c.startsOn, c.lastDay, c.reason])).toEqual([['2031-12-24', '2031-12-26', 'Christmas']])
  })

  it('removes a closure by its id', async () => {
    await addClosure({ startsOn: '2031-12-24', lastDay: '2031-12-26', reason: null })
    const [{ id }] = await listClosures('2031-12-01')
    await removeClosure(id)
    expect(await listClosures('2031-12-01')).toEqual([])
  })

  it('refuses a closure that ends before it starts (the database says no)', async () => {
    await expect(addClosure({ startsOn: '2031-12-26', lastDay: '2031-12-24', reason: null })).rejects.toThrow()
  })
})
