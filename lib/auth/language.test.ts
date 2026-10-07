import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_LANGUAGE, LANGUAGES, languageOf, parseLanguage } from './language'

describe('parseLanguage', () => {
  it('accepts the three languages of the site', () => {
    for (const language of LANGUAGES) expect(parseLanguage(language)).toBe(language)
  })

  it('refuses anything else, because it comes from a form or from metadata the account wrote itself', () => {
    for (const value of ['fr', 'IT', ' it', 'it ', '', null, undefined, 3, {}, ['it']]) expect(parseLanguage(value)).toBeNull()
  })

  it('falls back to Italian', () => {
    expect(languageOf('de')).toBe('de')
    expect(languageOf('nope')).toBe(DEFAULT_LANGUAGE)
    expect(DEFAULT_LANGUAGE).toBe('it')
  })

  it('has the same languages as the dictionaries of the site', () => {
    const messages = LANGUAGES.map((language) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${language}.json`), 'utf8')))
    expect(messages).toHaveLength(3)
  })
})
