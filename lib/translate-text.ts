import { translateFromItalian } from '@/lib/actions/translate'

/** The longest text Azure Translator is asked to translate in one go (lib/actions/translate.ts). */
export const TRANSLATION_MAX_CHARS = 5000

type Pair = { en: string; de: string }
export type NameAndDescriptionTranslation =
  | { ok: true; name: Pair; description: Pair }
  | { ok: false; message: string }

/**
 * EN and DE for a model's or a route's name and description.
 *
 * Returns a message instead of throwing: it used to throw, out of a Server
 * Action, and the panel answered with a full-page "This page couldn't load" that
 * threw away everything typed in the form. It is also called BEFORE anything is
 * written, so a failure cannot leave a half-saved row behind.
 */
export async function translateNameAndDescription(
  nameIt: string,
  descriptionIt: string
): Promise<NameAndDescriptionTranslation> {
  try {
    const [name, description] = await Promise.all([translateFromItalian(nameIt), translateFromItalian(descriptionIt)])
    return { ok: true, name, description }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // The text is the admin's own, but keep a stray line break out of the log all the same.
    console.error('[translate] failed:', reason.replace(/[\r\n]/g, ' '))
    return {
      ok: false,
      message: 'The English and German versions could not be generated, so nothing was saved. Try again in a moment.',
    }
  }
}
