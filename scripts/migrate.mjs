// Same as `drizzle-kit migrate`, but it prints the real error.
// The CLI's spinner swallows it: on failure it just exits 1 with no message.
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const url = process.env.DATABASE_DIRECT_URL
if (!url) {
  console.error('DATABASE_DIRECT_URL is not set')
  process.exit(1)
}

const client = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder: './lib/db/migrations' })
  console.log('Migrations applied.')
} catch (err) {
  console.error(err.cause?.message ?? err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
