import { describe, expect, it } from 'vitest'
import { transactionPoolerUrl } from './pooler'

const host = 'aws-1-eu-central-1.pooler.supabase.com'

describe('transactionPoolerUrl', () => {
  it('moves the shared pooler from session to transaction mode', () => {
    expect(transactionPoolerUrl(`postgresql://postgres.abc:p%40ss@${host}:5432/postgres`))
      .toBe(`postgresql://postgres.abc:p%40ss@${host}:6543/postgres`)
  })

  it('keeps the credentials and the query string', () => {
    const out = transactionPoolerUrl(`postgresql://postgres.abc:s3cr3t@${host}:5432/postgres?sslmode=require`)
    expect(out).toContain('postgres.abc:s3cr3t@')
    expect(out).toContain('?sslmode=require')
  })

  it('leaves a transaction-mode address alone', () => {
    const url = `postgresql://postgres.abc:x@${host}:6543/postgres?pgbouncer=true`
    expect(transactionPoolerUrl(url)).toBe(url)
  })

  it('leaves a direct connection alone', () => {
    const url = 'postgresql://postgres:x@db.abc.supabase.co:5432/postgres'
    expect(transactionPoolerUrl(url)).toBe(url)
  })

  it('leaves something that is not a URL alone', () => {
    expect(transactionPoolerUrl('not a url')).toBe('not a url')
  })
})
