import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> }

function createDb() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: { rejectUnauthorized: false } })
  return drizzle(client, { schema })
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db

export * from './schema'
