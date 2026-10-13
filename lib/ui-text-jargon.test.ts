import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The words of the site are for the people who read it, never about the software behind it (Kevin, 2026-10-13: «non scrivere specifiche del
 * software nella pagina effettiva del sito, al massimo come commento nel codice»). A visitor does not need to know the name of a library, a file
 * format, a service or an API: "a file you can keep", not "a JSON file"; "pay online", not "pay with Stripe Checkout".
 *
 * Not looked at: the privacy policy and the terms, where naming the providers who handle the data is a duty, not a detail. The panel's own
 * texts live in the components (in English): they are covered by the rule in CLAUDE.md, and the Dev page, the developer's diagnostics, is the
 * one place that names the services on purpose.
 */
const LANGUAGES = ['it', 'en', 'de']
const LEGAL_SECTIONS = new Set(['privacy', 'terms'])
const SOFTWARE = [
  'supabase', 'stripe', 'next\\.js', 'react', 'webhook', 'database', 'redis', 'cloudflare', 'oracle', 'vercel', 'docker', 'endpoint', 'realtime',
  'bullmq', 'postgres', 'sql', 'resend', 'azure', 'ffmpeg', 'avif', 'hls', 'json', 'api', 'token', 'cron', 'worker', 'cache', 'server',
]
const PATTERN = new RegExp(`\\b(${SOFTWARE.join('|')})\\b`, 'i')

function texts(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => texts(child, path ? `${path}.${key}` : key))
  return []
}

describe('the texts of the site do not talk about the software', () => {
  for (const lang of LANGUAGES) {
    it(`has none in ${lang}`, () => {
      const messages = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${lang}.json`), 'utf8')) as Record<string, unknown>
      const offenders = Object.entries(messages)
        .filter(([section]) => !LEGAL_SECTIONS.has(section))
        .flatMap(([section, value]) => texts(value, section))
        .filter(([, text]) => PATTERN.test(text))
        .map(([path, text]) => `${path}: ${text.slice(0, 80)}`)
      expect(offenders).toEqual([])
    })
  }
})
