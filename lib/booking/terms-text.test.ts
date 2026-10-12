import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { ROME } from '@/lib/dates'
import { HOLD_MINUTES, MAX_BIKES_PER_BOOKING, MAX_DAYS_AHEAD } from './rules'
import { refundDeadline } from './refund-deadline'

/**
 * The terms of rental promise numbers that the code enforces: how long the bikes are held, how far ahead and how many bikes you can book,
 * until when a refund is full. When one of them changes in the code, the terms must change with it, in the three languages: this fails until
 * they do (the privacy policy once named the wrong host for three weeks; lib/privacy-text.test.ts is the same idea).
 */
const terms = (lang: string): { booking_body: string; cancel_body: string } => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf8')).terms

describe('the terms of rental say what the code does', () => {
  for (const lang of ['it', 'en', 'de']) {
    it(`gives the hold, the horizon and the size of a booking, in ${lang}`, () => {
      const { booking_body } = terms(lang)
      expect(booking_body).toContain(`${HOLD_MINUTES}`)
      expect(booking_body).toContain(`${MAX_DAYS_AHEAD}`)
      expect(booking_body).toContain(`${MAX_BIKES_PER_BOOKING}`)
    })
  }

  it('puts the refund deadline at the hour and the day the code uses', () => {
    // 2031-12-10 is the first day: the deadline is 2031-12-08, 09:00 in Rome.
    expect(format(new TZDate(refundDeadline('2031-12-10').getTime(), ROME), 'yyyy-MM-dd HH:mm')).toBe('2031-12-08 09:00')
    for (const lang of ['it', 'en', 'de']) {
      const { cancel_body } = terms(lang)
      expect(cancel_body, lang).toMatch(/9:00/)
      expect(cancel_body, lang).toMatch(/\b(due|two|zwei)\b/)
    }
  })
})
