import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createClient } from '@supabase/supabase-js'
import { db, bikeReservations, customers } from '@/lib/db'
import { createFixture, reservationValues, type Fixture } from './fixtures'

describe('the reservations ping', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  // Retried: right after the whole suite has hammered the database the ping can be missed once,
  // a race between the channel's join and the first send (it passes 3 runs out of 3 on its own).
  // The panel itself does not depend on a single ping: it reloads on reconnect and when the tab
  // becomes visible again.
  it('sends a ping with the bike and the days, and no name, when a reservation is created', { retry: 2 }, async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    // A Drizzle query only runs when awaited: an `async` function makes sure it does.
    const [secret] = await db.insert(customers).values({
      firstName: 'Mario', lastName: 'Rossi segreto', email: `segreto-${crypto.randomUUID()}@example.com`,
      phone: '+39347000' + Math.floor(1000 + Math.random() * 9000), notes: 'nota segreta',
    }).returning()
    const insert = async () => {
      await db.insert(bikeReservations).values(
        reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { kind: 'counter_rental', customerId: secret.id }),
      )
    }
    try {
      const payload = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ping within 15 s')), 15_000)
        supabase.channel('reservations')
          .on('broadcast', { event: 'changed' }, (message) => { clearTimeout(timer); resolve(message.payload) })
          .subscribe((status) => { if (status === 'SUBSCRIBED') void insert() })
      })
      // `id` is the message id Realtime adds itself; everything else is what the trigger sends.
      expect(Object.keys(payload).sort()).toEqual(['bike_unit_id', 'ends_on', 'id', 'op', 'previous_bike_unit_id', 'starts_on'])
      expect(payload.op).toBe('INSERT')
      expect(payload.bike_unit_id).toBe(fx.unitIds[0])
      expect(JSON.stringify(payload)).not.toMatch(/Rossi|segreto|\+39/)
    } finally {
      await supabase.removeAllChannels()
      await db.delete(bikeReservations).where(eq(bikeReservations.customerId, secret.id))
      await db.delete(customers).where(eq(customers.id, secret.id))
    }
  })

  it('has a trigger function that never touches the personal details and cannot be called through the API', async () => {
    const [{ definition }] = await db.execute<{ definition: string }>(sql`
      select pg_get_functiondef('public.notify_reservation_change()'::regprocedure) as definition`)
    for (const column of ['label', 'first_name', 'last_name', 'email', 'phone', 'notes']) expect(definition).not.toContain(column)

    const [{ anon, authenticated }] = await db.execute<{ anon: boolean; authenticated: boolean }>(sql`
      select has_function_privilege('anon', 'public.notify_reservation_change()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.notify_reservation_change()', 'execute') as authenticated`)
    expect(anon).toBe(false)
    expect(authenticated).toBe(false)
  })
})
