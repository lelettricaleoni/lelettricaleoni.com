import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> }

function createDb() {
  // One connection per instance, handed back after twenty idle seconds. The
  // pooler in session mode gives every client a slot of its own out of fifteen,
  // and without a timeout a warm instance kept its slot for as long as it
  // lived — busy or not. On 2026-09-11 three previews under test at once used
  // them all up, and pages failed with EMAXCONNSESSION.
  const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    idle_timeout: 20,
    ssl: { rejectUnauthorized: false },
  })
  return drizzle(client, { schema })
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db

export * from './schema'
