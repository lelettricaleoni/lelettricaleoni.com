/**
 * The description a search result shows for a route page.
 *
 * It used to be the first 155 characters of the route's text, cut wherever the count
 * ran out — mid-word, and the same shape for every route. Two things replace that:
 * the figures that tell one route from another (distance, climb, difficulty) go
 * first, and the text after them is cut at the end of a sentence, or at a word.
 *
 * Only what the route already has is used: nothing here invents a place or a claim
 * the route's own data does not carry.
 */

/** What a search result reliably shows of a description; longer gets cut by Google. */
export const META_DESCRIPTION_MAX = 155

/**
 * `text` folded onto one line and shortened to at most `max` characters: at the end
 * of the last sentence that fits (when that keeps at least half the room), otherwise
 * at the last whole word, with an ellipsis.
 */
export function truncateAtBoundary(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat

  for (let i = max - 1; i >= Math.ceil(max / 2) - 1; i--) {
    const endsSentence = /[.!?]/.test(flat[i]) && (i + 1 === flat.length || flat[i + 1] === ' ')
    if (endsSentence) return flat.slice(0, i + 1)
  }

  // One character is kept back for the ellipsis.
  const limit = max - 1
  let cut = flat.lastIndexOf(' ', limit)
  if (cut <= 0) cut = limit
  return `${flat.slice(0, cut).trimEnd().replace(/[,;:]$/, '')}…`
}

interface RouteDescriptionInput {
  lang: string
  description: string | null | undefined
  /** As stored: numeric(6,2) comes back from Postgres as a string. */
  distanceKm: string | null | undefined
  elevationM: number | null | undefined
  labels: { distance: string; elevation: string; difficulty: string }
}

export function buildRouteDescription({ lang, description, distanceKm, elevationM, labels }: RouteDescriptionInput): string {
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })

  const km = distanceKm != null && distanceKm !== '' ? Number(distanceKm) : NaN
  const facts = [
    Number.isFinite(km) && km > 0 ? `${labels.distance} ${number.format(km)} km` : null,
    elevationM != null ? `${labels.elevation} ${number.format(elevationM)} m` : null,
    labels.difficulty || null,
  ].filter((part): part is string => part !== null)
  const head = facts.join(' · ')

  const text = description?.replace(/\s+/g, ' ').trim()
  if (!text) return head
  if (!head) return truncateAtBoundary(text, META_DESCRIPTION_MAX)

  const separator = ' — '
  return `${head}${separator}${truncateAtBoundary(text, META_DESCRIPTION_MAX - head.length - separator.length)}`
}
