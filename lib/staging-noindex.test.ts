import { describe, it, expect } from 'vitest'
import nextConfig from '../next.config'

describe('staging must not be indexed', () => {
  it('sends X-Robots-Tag noindex on every path of the staging host, and only there', async () => {
    const rules = await nextConfig.headers!()
    const staging = rules.filter((r) =>
      r.has?.some((h) => h.type === 'host' && h.value === 'staging.lelettricaleoni.com')
    )

    expect(staging).toHaveLength(1)
    expect(staging[0].source).toBe('/:path*')
    expect(staging[0].headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' })
    // A rule without a host condition would noindex the real site.
    expect(rules.every((r) => r.has?.length)).toBe(true)
  })
})
