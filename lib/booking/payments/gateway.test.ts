import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreateSessionInput } from './gateway'
import { FakeGateway } from './fake'
import { getFakeGateway, getPaymentGateway, paymentsAvailable, PaymentsNotConfiguredError } from './index'

const input = (overrides: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  bookingId: 'b1',
  bookingKey: 'k1',
  customerEmail: 'a@example.test',
  language: 'it',
  lines: [{ label: 'eMTB', amountCents: 6000 }],
  expiresAt: new Date(Date.now() + 30 * 60_000),
  successUrl: 'https://example.test/ok',
  cancelUrl: 'https://example.test/back',
  ...overrides,
})
const gateway = () => new FakeGateway(new Map(), new Map())

describe('the fake gateway', () => {
  it('opens a session with a page to pay on', async () => {
    const fake = gateway()
    const session = await fake.createSession(input())
    expect(session.id).toMatch(/^fake_cs_/)
    expect(session.url).toBe(`/it/rent/fake-checkout/${session.id}`)
    expect(await fake.getSession(session.id)).toEqual({ status: 'open', url: session.url })
  })

  it('turns an open session into a paid one, with a payment reference', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input())
    expect(fake.pay(id)).toBe(true)
    expect(await fake.getSession(id)).toEqual({ status: 'paid', paymentRef: `fake_pi_${id}` })
  })

  it('refuses to pay twice, or to pay a session that is closed', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input())
    fake.pay(id)
    expect(fake.pay(id)).toBe(false)
    const other = await fake.createSession(input())
    await fake.expireSession(other.id)
    expect(fake.pay(other.id)).toBe(false)
    expect(fake.pay('fake_cs_unknown')).toBe(false)
  })

  it('expires an open session once; a paid or already expired one cannot be expired', async () => {
    const fake = gateway()
    const open = await fake.createSession(input())
    expect(await fake.expireSession(open.id)).toBe('expired')
    expect(await fake.getSession(open.id)).toEqual({ status: 'expired' })
    expect(await fake.expireSession(open.id)).toBe('not_open')
    const paid = await fake.createSession(input())
    fake.pay(paid.id)
    expect(await fake.expireSession(paid.id)).toBe('not_open')
    expect((await fake.getSession(paid.id)).status).toBe('paid')
  })

  it('reads a session past its time as expired, and cannot be paid', async () => {
    const fake = gateway()
    const { id } = await fake.createSession(input({ expiresAt: new Date(Date.now() - 1000) }))
    expect(await fake.getSession(id)).toEqual({ status: 'expired' })
    expect(fake.pay(id)).toBe(false)
    expect(await fake.expireSession(id)).toBe('not_open')
  })

  it('reads a session it does not know as expired', async () => {
    expect(await gateway().getSession('fake_cs_nobody')).toEqual({ status: 'expired' })
  })

  it('refunds a reservation once: asking again gives the same refund, and a failure is only for the next try', async () => {
    const fake = gateway()
    const first = await fake.refund({ reservationId: 'r1', paymentRef: 'pi', amountCents: 2000 })
    const again = await fake.refund({ reservationId: 'r1', paymentRef: 'pi', amountCents: 2000 })
    expect(first).toEqual({ status: 'succeeded', refundRef: 'fake_re_r1' })
    expect(again).toEqual(first)
    expect(fake.refundCount()).toBe(1)

    fake.failNextRefund = true
    expect(await fake.refund({ reservationId: 'r2', paymentRef: 'pi', amountCents: 500 })).toMatchObject({ status: 'failed' })
    expect(fake.refundCount()).toBe(1)
    expect(await fake.refund({ reservationId: 'r2', paymentRef: 'pi', amountCents: 500 })).toEqual({ status: 'succeeded', refundRef: 'fake_re_r2' })
  })
})

describe('which gateway an environment gets', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('never hands out the fake in production: without Stripe there is no gateway at all', () => {
    vi.stubEnv('APP_ENV', 'production')
    expect(() => getPaymentGateway()).toThrow(PaymentsNotConfiguredError)
    expect(() => getFakeGateway()).toThrow(PaymentsNotConfiguredError)
    expect(paymentsAvailable()).toBe(false)
  })

  it('hands out the fake on staging and on a laptop, always the same one', () => {
    for (const env of ['staging', 'development']) {
      vi.stubEnv('APP_ENV', env)
      expect(getPaymentGateway().name).toBe('fake')
      expect(getPaymentGateway()).toBe(getPaymentGateway())
      expect(getFakeGateway()).toBe(getPaymentGateway())
      expect(paymentsAvailable()).toBe(true)
    }
  })
})
