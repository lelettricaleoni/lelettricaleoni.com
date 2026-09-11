import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { transactionPoolerUrl } from './pooler'

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
  const client = postgres(transactionPoolerUrl(process.env.DATABASE_URL!), {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    ssl: { rejectUnauthorized: false },
  })
  return drizzle(client, { schema })
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db

export * from './schema'
