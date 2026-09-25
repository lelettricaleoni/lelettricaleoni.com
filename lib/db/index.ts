import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { transactionPoolerUrl } from './pooler'
import { clientOptions } from './client-options'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> }

function createDb() {
  // Always the transaction pooler. In session mode every client holds one of
  // fifteen slots for as long as it is connected, and production shares those
  // fifteen with every preview: on 2026-09-11 six pull requests under test
  // took them all, and the live route list failed with EMAXCONNSESSION.
  // In transaction mode a slot is held only for the length of a query.
  //
  // `prepare: false` because a prepared statement lives on one server
  // connection, and transaction mode hands out a different one each time.
  // `idle_timeout` hands the client connection back when an instance is idle.
  //
  // `max: 3`, not 1, because of 2026-09-15: /routes and /manage/routes hung
  // on a blank loading state for five full minutes (Vercel's own function
  // timeout, not a database one) even though production already enforces a
  // 2-minute `statement_timeout` at the database level and no single query
  // ever took more than a few milliseconds (checked in pg_stat_statements).
  // The five minutes was spent waiting in postgres.js's own queue for the
  // one connection `max: 1` allowed, not running a query — Fluid Compute
  // reuses one warm instance across concurrent requests, and Cache
  // Components can fire several background revalidations from that instance
  // at once. A stuck client-side queue has no timeout of its own to hit.
  // (Tried first: setting `statement_timeout` per connection — confirmed with
  // `show statement_timeout` that Supavisor's transaction-mode pooler does
  // not honour it, since it can hand a later statement to a different
  // backend than the one that received the startup parameter. The 2-minute
  // ceiling seen in production is set some other way, outside this code.)
  // The options themselves, and why `max_pipeline: 0` is among them, live in
  // client-options.ts.
  const client = postgres(transactionPoolerUrl(process.env.DATABASE_URL!), clientOptions)
  return drizzle(client, { schema })
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db

export * from './schema'
