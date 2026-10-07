import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

const enumValues = async (type: string) => {
  const rows = await db.execute<{ v: string }>(sql`select unnest(enum_range(null::${sql.identifier(type)}))::text as v`)
  return rows.map((row) => row.v)
}

describe('the enums of a booking', () => {
  it('has the states a held bike goes through', async () => {
    expect(await enumValues('reservation_status')).toEqual(expect.arrayContaining(['confirmed', 'held', 'expired', 'cancelled']))
  })

  it('has a kind for a rental made online', async () => {
    expect(await enumValues('reservation_kind')).toEqual(expect.arrayContaining(['counter_rental', 'maintenance', 'online_rental']))
  })
})
