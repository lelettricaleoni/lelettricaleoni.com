import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The privacy policy and the cookie banner say what the site does. This test keeps them from drifting behind the
 * code (Kevin, 2026-10-07: «devi andarci preventivo con la privacy»): a new service the site talks to, or a new
 * place that stores something in the browser, FAILS here until somebody has decided what it means for the policy
 * and the banner and written it down. It cannot judge the policy, only make sure the question is asked.
 *
 * When this fails, do not just add the line: load the `privacy-cookies` skill, update the policy
 * (`messages/*.json`, `privacy`) and the banner (`components/cookie-consent.tsx`) in the same change, then add
 * the host or the file below with the reason.
 */
const ROOTS = ['app', 'components', 'lib', 'worker']
const SKIP_DIRS = new Set(['node_modules', '.next'])

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) found.push(path)
  }
  return found
}

const files = [...ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root))), join(process.cwd(), 'proxy.ts')]
const read = (file: string) => readFileSync(file, 'utf8')
const relative = (file: string) => file.replace(process.cwd(), '').replace(/\\/g, '/')

const privacy = (lang: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf8')).privacy
const policyText = (lang: string) => Object.values(privacy(lang)).join('\n')

// ---------------------------------------------------------------------------------------------------------------
// 1. Services the site talks to
// ---------------------------------------------------------------------------------------------------------------

/**
 * Hosts that receive a visitor's or a customer's data, or their IP address, and the name the policy must carry for
 * them (in the three languages). Services reached through a variable and not a literal (Cesium ion, Supabase, the
 * media bucket, Resend) are named in the policy and in the `privacy-cookies` skill, not here.
 */
const DECLARED_IN_THE_POLICY: Record<string, RegExp> = {
  'google.com': /Google/, // the map of the contact section, behind a click; the sign-in
  'googletagmanager.com': /Google Analytics/, // analytics, with consent
  'googleapis.com': /Google/, // the sign-in (people), the calendar of the shop
  'arcgisonline.com': /Esri/, // the satellite imagery of the 3D map, loaded by the browser
}

/**
 * Hosts that are NOT a place where personal data goes, with the reason: a link the person follows, a vocabulary name
 * in structured data, an address of our own, a service the server (not the visitor) talks to without personal data.
 */
const NOT_PERSONAL_DATA: Record<string, string> = {
  'lelettricaleoni.com': 'our own',
  'nextjs.org': 'a link in a comment or an error message',
  'schema.org': 'a vocabulary name in structured data',
  'w3.org': 'an XML namespace',
  'purl.org': 'an XML namespace',
  'rfc-editor.org': 'a reference in a comment',
  'instagram.com': 'a link the person follows (and a profile in structured data)',
  'facebook.com': 'a profile in structured data, never loaded',
  'wa.me': 'a link the person follows',
  'strava.com': 'a link the person follows',
  'komoot.com': 'a link the person follows',
  'cartocdn.com': 'map tiles asked for by our server, which sends none of the visitor\'s data',
  'cloudflare.com': 'the statistics of the panel, asked for by our server (and the network the site is behind: named in the policy)',
  'example.test': 'a fixture',
  'cdn.test': 'a fixture',
  'elsewhere.com': 'a fixture',
  'placeholder.invalid': 'a fixture',
}

function hostsIn(source: string): string[] {
  return [...source.matchAll(/https?:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-z]{2,})/g)].map((match) => match[1].toLowerCase())
}
const knownHost = (host: string, table: Record<string, unknown>) => Object.keys(table).some((known) => host === known || host.endsWith(`.${known}`))

describe('services the site talks to', () => {
  const found = new Map<string, string[]>()
  for (const file of files) {
    for (const host of hostsIn(read(file))) found.set(host, [...(found.get(host) ?? []), relative(file)])
  }

  it('finds the sources it is meant to read', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no host that nobody has decided about', () => {
    const undecided = [...found.entries()]
      .filter(([host]) => !knownHost(host, DECLARED_IN_THE_POLICY) && !knownHost(host, NOT_PERSONAL_DATA))
      .map(([host, where]) => `${host}  (${[...new Set(where)].join(', ')})`)
    expect(undecided, 'a new service: declare it in the privacy policy and the skill, then list it in lib/privacy-surface.test.ts').toEqual([])
  })

  for (const lang of ['it', 'en', 'de']) {
    for (const [host, name] of Object.entries(DECLARED_IN_THE_POLICY)) {
      it(`the policy names the service behind ${host}, in ${lang}`, () => {
        expect(policyText(lang), `${host} is used by the code and the policy (${lang}) does not name it`).toMatch(name)
      })
    }
  }
})

// ---------------------------------------------------------------------------------------------------------------
// 2. What is stored in the browser
// ---------------------------------------------------------------------------------------------------------------

const BROWSER_STORAGE = /document\.cookie|localStorage|sessionStorage|indexedDB|cookies\(\)|cookieStore\.set|\.cookies\.set\(|setCookie/

/**
 * The files allowed to set a cookie or to use the storage of the browser, and what they keep. The cookies are the ones
 * listed in the banner (`components/cookie-consent.tsx`); a file here that stores something that is not in that list is
 * a mistake in this table or in the banner.
 */
const MAY_STORE_IN_THE_BROWSER: Record<string, string> = {
  '/app/auth/callback/route.ts': 'the session cookies of the account (sb-*-auth-token): in the banner as necessary',
  '/lib/supabase/server.ts': 'the same session cookies, renewed',
  '/proxy.ts': 'the same session cookies, renewed on each request',
  '/lib/stale-action.ts': 'sessionStorage: a counter of ten seconds that stops a reload loop; no personal data, gone with the tab',
  '/components/admin/gpx-upload.tsx': 'sessionStorage: an upload id; the panel only (staff)',
  '/components/admin/media-upload.tsx': 'sessionStorage: an upload id; the panel only (staff)',
  '/components/admin/video-upload.tsx': 'sessionStorage: an upload id; the panel only (staff)',
}

describe('what is stored in the browser', () => {
  it('is only where it has been decided, and the banner lists the cookies', () => {
    const users = files.filter((file) => BROWSER_STORAGE.test(read(file))).map(relative)
    const undecided = users.filter((file) => !(file in MAY_STORE_IN_THE_BROWSER))
    expect(undecided, 'a new cookie or storage: add it to the banner (three languages) and the policy, then list it in lib/privacy-surface.test.ts').toEqual([])
  })

  it('does not keep a file in the table that no longer stores anything', () => {
    const stale = Object.keys(MAY_STORE_IN_THE_BROWSER).filter((file) => {
      const path = files.find((candidate) => relative(candidate) === file)
      return !path || !BROWSER_STORAGE.test(read(path))
    })
    expect(stale).toEqual([])
  })

  it('has the cookies of the session in the banner in the three languages', () => {
    const banner = read(join(process.cwd(), 'components', 'cookie-consent.tsx'))
    expect(banner.match(/sb-\*-auth-token'/g)).toHaveLength(3)
  })
})
