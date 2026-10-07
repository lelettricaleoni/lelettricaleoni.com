import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What the privacy policy says about who hosts the site must be what is true. It named Vercel for
 * three weeks after the site moved to its own server (2026-10-06): a statement about a processor of
 * visitors' data that was simply wrong. The hosting facts live in docs/ai/STATE.md; when they change,
 * these texts change with them.
 */
const privacy = (lang: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf8')).privacy

describe('privacy policy: who hosts the site', () => {
  for (const lang of ['it', 'en', 'de']) {
    it(`does not name Vercel as the host, in ${lang}`, () => {
      const text = Object.values(privacy(lang)).join('\n')
      expect(text).not.toMatch(/vercel/i)
    })

    it(`names the server and the network provider in front of it, in ${lang}`, () => {
      const body: string = privacy(lang).third_parties_body
      expect(body).toMatch(/Oracle/)
      expect(body).toMatch(/Milan|Milano|Mailand/)
      expect(body).toMatch(/Cloudflare/)
    })
  }
})
