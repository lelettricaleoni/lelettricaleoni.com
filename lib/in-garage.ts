import { sql } from 'drizzle-orm'
import { bikeUnits } from '@/lib/db/schema'

/**
 * Which bikes the public site counts as "in the garage": the ones not retired as of today in Rome.
 * `retired_on` is the first day a bike is no longer offered, so a bike retired today is already
 * out.
 *
 * "Today" comes from the database (`now() at time zone 'Europe/Rome'`), not from JavaScript:
 * these queries run inside `'use cache'` functions, where reading the clock is not allowed, and
 * the cached answer is then correct for the day it was computed.
 *
 * Every query on the public side that reaches `bike_units` must carry this condition; the guard
 * in lib/in-garage.test.ts counts them.
 */
export function inGarage() {
  return sql`(${bikeUnits.retiredOn} is null or ${bikeUnits.retiredOn} > (now() at time zone 'Europe/Rome')::date)`
}
