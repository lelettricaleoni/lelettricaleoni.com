/**
 * The languages of the site, and the one a person reads.
 *
 * The site is in Italian, English and German (`app/[lang]`). A customer's own language is stored on their
 * record (`customers.language`): it starts as the language they were visiting in when they made the account,
 * and they change it in their account settings. Once signed in, the language is that setting, which is why
 * the language menu leaves the navbar for them.
 */
export const LANGUAGES = ['it', 'en', 'de'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'it'

/** The language, or null when the value is not one of the three (a form field, a metadata value: never trusted). */
export function parseLanguage(value: unknown): Language | null {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value) ? (value as Language) : null
}

/** The language, or the default one. */
export function languageOf(value: unknown): Language {
  return parseLanguage(value) ?? DEFAULT_LANGUAGE
}
