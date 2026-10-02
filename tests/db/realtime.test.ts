import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createClient } from '@supabase/supabase-js'
import { db, bikeReservations } from '@/lib/db'
import { createFixture, reservationValues, type Fixture } from './fixtures'

describe('the reservations ping', () => {
  let fx: Fixture
  beforeEach(async () => { fx = await createFixture(1) })
  afterEach(async () => { await fx.cleanup() })

  it('sends a ping with the bike and the days, and no name, when a reservation is created', async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    // A Drizzle query only runs when awaited: an `async` function makes sure it does.
    const insert = async () => {
      await db.insert(bikeReservations).values(
        reservationValues(fx.unitIds[0], '2031-07-10', '2031-07-13', { label: 'Mario Rossi segreto' }),
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
      expect(JSON.stringify(payload)).not.toContain('Rossi')
    } finally {
      await supabase.removeAllChannels()
    }
  })

  it('has a trigger function that never touches the label and cannot be called through the API', async () => {
    const [{ definition }] = await db.execute<{ definition: string }>(sql`
      select pg_get_functiondef('public.notify_reservation_change()'::regprocedure) as definition`)
    expect(definition).not.toContain('label')

    const [{ anon, authenticated }] = await db.execute<{ anon: boolean; authenticated: boolean }>(sql`
      select has_function_privilege('anon', 'public.notify_reservation_change()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.notify_reservation_change()', 'execute') as authenticated`)
    expect(anon).toBe(false)
    expect(authenticated).toBe(false)
  })
})
