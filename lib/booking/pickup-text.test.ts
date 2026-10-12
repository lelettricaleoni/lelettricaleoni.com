import { describe, expect, it } from 'vitest'
import type { ShopSchedule } from '@/lib/shop-schedule'
import { pickupText } from './pickup-text'

const DAY = [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '14:00', closesAt: '19:00' }]
const SCHEDULE: ShopSchedule = { weekly: { 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: [{ opensAt: '09:00', closesAt: '13:00' }], 7: [] }, closures: [] }
const dict = {
  pickup_when: 'Ritiro {pickupDay}, orario {pickupHours}. Riconsegna {returnDay}, orario {returnHours}.',
  pickup_note: 'Ritiro il primo giorno, riconsegna l\'ultimo.',
}

describe('pickupText: the day and the hours of the pickup and of the return', () => {
  it('says the hours of the first day and of the last day, each its own', () => {
    // Mon 3 Nov to Sat 8 Nov 2031 (the end is exclusive: the 9th)
    const text = pickupText({ startsOn: '2031-11-03', endsOn: '2031-11-09' }, SCHEDULE, 'it', dict)
    expect(text).toMatch(/^Ritiro lun 3 nov, orario 09:00–13:00 e 14:00–19:00\. Riconsegna sab 8 nov, orario 09:00–13:00\.$/)
  })

  it('falls back to the plain note when the shop has no hours that day (a stay typed by hand, or a schedule not declared)', () => {
    expect(pickupText({ startsOn: '2031-11-03', endsOn: '2031-11-10' }, SCHEDULE, 'it', dict)).toBe(dict.pickup_note) // ends on a Sunday: closed
    expect(pickupText({ startsOn: '2031-11-03', endsOn: '2031-11-05' }, { weekly: {}, closures: [] }, 'it', dict)).toBe(dict.pickup_note)
  })

  it('uses the closures: a closed first day has no hours', () => {
    const closed: ShopSchedule = { ...SCHEDULE, closures: [{ startsOn: '2031-11-03', endsOn: '2031-11-04' }] }
    expect(pickupText({ startsOn: '2031-11-03', endsOn: '2031-11-05' }, closed, 'it', dict)).toBe(dict.pickup_note)
  })
})
