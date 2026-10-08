import { describe, expect, it } from 'vitest'
import { isRefundable, refundDeadline } from './refund-deadline'

describe('refundDeadline', () => {
  it('is 09:00 in Rome, two days before the first day', () => {
    expect(refundDeadline('2031-07-10').toISOString()).toBe('2031-07-08T07:00:00.000Z') // summer time, +02:00
    expect(refundDeadline('2031-12-10').toISOString()).toBe('2031-12-08T08:00:00.000Z') // winter time, +01:00
  })

  it('follows the clock change: the hour of Rome, not a fixed number of hours', () => {
    // Summer time starts on Sunday 30 March 2031 and ends on Sunday 26 October 2031.
    expect(refundDeadline('2031-03-31').toISOString()).toBe('2031-03-29T08:00:00.000Z') // still winter
    expect(refundDeadline('2031-04-02').toISOString()).toBe('2031-03-31T07:00:00.000Z') // already summer
    expect(refundDeadline('2031-10-27').toISOString()).toBe('2031-10-25T07:00:00.000Z') // still summer
    expect(refundDeadline('2031-10-29').toISOString()).toBe('2031-10-27T08:00:00.000Z') // already winter
  })

  it('crosses a month and a year', () => {
    expect(refundDeadline('2031-03-01').toISOString()).toBe('2031-02-27T08:00:00.000Z')
    expect(refundDeadline('2032-01-01').toISOString()).toBe('2031-12-30T08:00:00.000Z')
  })
})

describe('isRefundable', () => {
  const start = '2031-07-10' // deadline 2031-07-08 07:00 UTC
  it('is true up to and including the deadline, false right after', () => {
    expect(isRefundable(start, new Date('2031-07-08T06:59:59.999Z'))).toBe(true)
    expect(isRefundable(start, new Date('2031-07-08T07:00:00.000Z'))).toBe(true)
    expect(isRefundable(start, new Date('2031-07-08T07:00:00.001Z'))).toBe(false)
  })

  it('is false on the day itself and after the start', () => {
    expect(isRefundable(start, new Date('2031-07-10T05:00:00.000Z'))).toBe(false)
    expect(isRefundable(start, new Date('2031-07-12T05:00:00.000Z'))).toBe(false)
  })
})
