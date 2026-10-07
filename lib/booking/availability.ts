import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DayRange } from '@/lib/dates'

export interface FreeBikes {
  bikeModelId: string
  bikeSizeId: string
  bikeVersionId: string
  free: number
}

/**
 * How many bikes of each model, size and version are free for the whole of `range` (the end is exclusive). A bike is taken by a
 * `confirmed` or a `held` reservation that overlaps; `expired` and `cancelled` rows free it. A bike retired before the end of the
 * stay is not offered. Combinations with none free are left out.
 *
 * `publishedOnly` (the default) is what the public page shows: only models the shop has published.
 * One statement, so the picture is a single moment.
 */
export async function getFreeBikes(range: DayRange, options: { publishedOnly?: boolean } = {}): Promise<FreeBikes[]> {
  const publishedOnly = options.publishedOnly ?? true
  const rows = await db.execute<{ bike_model_id: string; bike_size_id: string; bike_version_id: string; free: number }>(sql`
    select u.bike_model_id, u.bike_size_id, u.bike_version_id, count(*)::int as free
    from bike_units u
    join bike_models m on m.id = u.bike_model_id
    where (${publishedOnly}::boolean = false or m.is_published)
      and (u.retired_on is null or ${range.endsOn}::date <= u.retired_on)
      and not exists (
        select 1 from bike_reservations r
        where r.bike_unit_id = u.id and r.status in ('confirmed', 'held')
          and r.during && daterange(${range.startsOn}::date, ${range.endsOn}::date, '[)'))
    group by u.bike_model_id, u.bike_size_id, u.bike_version_id`)
  return rows.map((row) => ({
    bikeModelId: row.bike_model_id, bikeSizeId: row.bike_size_id, bikeVersionId: row.bike_version_id, free: row.free,
  }))
}
