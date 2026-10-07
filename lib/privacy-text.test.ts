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

/**
 * Requests about personal data go to their own address, `privacy@`, and not to the shop's general one
 * (Kevin, 2026-10-07). The three places that say so are the owner block, the contact section and the
 * translated sentence.
 */
describe('privacy policy: where to write', () => {
  const page = readFileSync(join(process.cwd(), 'app', '[lang]', 'privacy', 'page.tsx'), 'utf8')

  it('names privacy@ and not info@ on the page', () => {
    expect(page).toMatch(/privacy@lelettricaleoni\.com/)
    expect(page).not.toMatch(/info@lelettricaleoni\.com/)
  })

  for (const lang of ['it', 'en', 'de']) {
    it(`sends data requests to privacy@, in ${lang}`, () => {
      const body: string = privacy(lang).contact_body
      expect(body).toContain('privacy@lelettricaleoni.com')
      expect(body).not.toContain('info@')
    })
  }
})

/**
 * The policy has to say what the site does now that it has accounts (slice 2): who gets the data, what is kept, what
 * the browser loads from other services, and the cookies of the session. A statement that nobody's data is collected
 * stopped being true with the first account.
 */
describe('privacy policy: accounts', () => {
  const everything = (lang: string) => Object.values(privacy(lang)).join('\n')

  for (const lang of ['it', 'en', 'de']) {
    it(`does not say that no personal data is collected, in ${lang}`, () => {
      expect(everything(lang)).not.toMatch(/Nessun dato personale identificativo|No personally identifiable data|Es werden keine personenbezogenen/i)
    })

    it(`names who processes the accounts and the service emails, in ${lang}`, () => {
      const body: string = privacy(lang).third_parties_body
      expect(body).toMatch(/Supabase/)
      expect(body).toMatch(/Resend/)
    })

    it(`says what the browser loads from other services, in ${lang}`, () => {
      const body: string = privacy(lang).browser_body
      expect(body).toMatch(/Esri/)
      expect(body).toMatch(/Cesium/)
      expect(body).toMatch(/Google Maps/)
    })

    it(`says what is kept when an account is deleted, in ${lang}`, () => {
      expect(privacy(lang).retention_body).toMatch(/\n\n/)
      expect(privacy(lang).retention_body).toMatch(/14/)
    })
  }

  it('lists the cookies of the session in the banner, in the three languages', () => {
    const banner = readFileSync(join(process.cwd(), 'components', 'cookie-consent.tsx'), 'utf8')
    expect(banner.match(/sb-\*-auth-token'/g)).toHaveLength(3)
    expect(banner.match(/sb-\*-auth-token-code-verifier/g)).toHaveLength(3)
    expect(banner.match(/cc_cookie/g)).toHaveLength(3)
  })
})
