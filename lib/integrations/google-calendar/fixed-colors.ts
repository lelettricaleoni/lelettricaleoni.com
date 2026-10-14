/*
 * The fallback when the calendar cannot have labels (the service account has no owner access to it): an event can still take one of
 * Google's eleven fixed colours (`colorId`), so a model gets the one nearest to its own. Several models may land on the same one:
 * that is the price of the fallback, and the Activity tab says how to get the real colours.
 * The shades are the ones Google shows for its event colours (checked against the colours endpoint on 2026-10-13).
 */

const GOOGLE_EVENT_COLORS: ReadonlyArray<{ id: string; hex: string }> = [
  { id: '1', hex: '#a4bdfc' }, // lavender
  { id: '2', hex: '#7ae7bf' }, // sage
  { id: '3', hex: '#dbadff' }, // grape
  { id: '4', hex: '#ff887c' }, // flamingo
  { id: '5', hex: '#fbd75b' }, // banana
  { id: '6', hex: '#ffb878' }, // tangerine
  { id: '7', hex: '#46d6db' }, // peacock
  // 8, graphite, is the maintenance's: no model gets it
  { id: '9', hex: '#5484ed' }, // blueberry
  { id: '10', hex: '#51b749' }, // basil
  { id: '11', hex: '#dc2127' }, // tomato
]

/** The graphite of the maintenance events in the fallback. */
export const MAINTENANCE_COLOR_ID = '8'

const channels = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))

/** The `colorId` of the Google colour nearest to `hex` (`#rrggbb`), by the distance between the red, green and blue values. */
export function nearestGoogleColorId(hex: string): string {
  const [r, g, b] = channels(hex)
  let best = GOOGLE_EVENT_COLORS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const color of GOOGLE_EVENT_COLORS) {
    const [cr, cg, cb] = channels(color.hex)
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) {
      best = color
      bestDistance = distance
    }
  }
  return best.id
}
