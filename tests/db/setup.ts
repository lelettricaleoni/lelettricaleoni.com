// These tests insert and delete rows. They must only ever run against the development database.
const url = process.env.DATABASE_URL ?? ''
if (!url) throw new Error('DATABASE_URL is missing: run these tests with `npm run test:db`')
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  throw new Error('Database tests never run in production')
}
// The production Supabase project (docs/environment-variables.md).
if (url.includes('hhfnhzdourgkinwlqvtc')) {
  throw new Error('DATABASE_URL points at the production project: refusing to run')
}
