/**
 * When the English and German versions have to be regenerated.
 *
 * The admin writes only Italian; EN and DE come from Azure Translator. That
 * used to happen only if a switch was ticked, which made a silent failure
 * possible: edit the Italian, forget the switch, and the site keeps showing
 * English and German visitors a text that no longer matches — with nothing
 * anywhere to say so.
 *
 * So the text decides, not the person. The switch survives only as an
 * override, for when a translation came out badly and is worth another try on
 * unchanged input.
 */

export interface TranslatableText {
  name: string
  description: string
}

export function needsRetranslation(
  current: TranslatableText | undefined,
  next: TranslatableText,
  forced = false
): boolean {
  if (forced) return true
  // No Italian on record yet: everything downstream of it is missing too.
  if (!current) return true
  return current.name !== next.name || current.description !== next.description
}
