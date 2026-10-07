import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import nextConfig from '../next.config'

describe('redirects in next.config.ts', () => {
  it('never send a visitor to a file of public/ that is not there', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    // The old-site PDF redirect pointed at "Volantino 2023.pdf" for months after the file was gone:
    // Google's indexed URL answered 308 and then 404.
    const missing = redirects
      .map((r) => r.destination)
      .filter((destination) => destination.startsWith('/pdf/'))
      .filter((destination) => !existsSync(join(process.cwd(), 'public', decodeURIComponent(destination))))
    expect(missing).toEqual([])
  })
})
