import { z } from 'zod'

/*
 * The colour of a bike model, for organising: today it is the colour of the model's bookings on Google Calendar
 * (lib/integrations/google-calendar/labels.ts). Stored as `#rrggbb` on the model; a person may pick any colour, and the panel offers these
 * to start from. The same list is in migration 0026, which gave the models that existed their first colours: keep them together.
 */

export const MODEL_COLORS = [
  { hex: '#039be5', name: 'Sky blue' },
  { hex: '#f4511e', name: 'Orange' },
  { hex: '#33b679', name: 'Mint' },
  { hex: '#8e24aa', name: 'Purple' },
  { hex: '#f6bf26', name: 'Yellow' },
  { hex: '#e91e63', name: 'Pink' },
  { hex: '#3f51b5', name: 'Indigo' },
  { hex: '#0b8043', name: 'Green' },
  { hex: '#d50000', name: 'Red' },
  { hex: '#009688', name: 'Teal' },
  { hex: '#795548', name: 'Brown' },
  { hex: '#7cb342', name: 'Lime' },
] as const

/** The grey of the maintenance events: it is never offered to a model, so a maintenance always stands out from the rentals. */
export const MAINTENANCE_COLOR = '#616161'

/** What a colour is allowed to look like: six hexadecimal digits, lowercase (what the browser's colour field gives). */
export const hexColorSchema = z.string().toLowerCase().regex(/^#[0-9a-f]{6}$/, 'Pick a colour')

/**
 * The colour for a new model: the one of the list used the least by the colours given (the first on a tie), so the colours spread
 * before any repeats. Colours outside the list (picked by hand) count for nothing here.
 */
export function nextModelColor(used: ReadonlyArray<string | null>): string {
  const counts = new Map<string, number>(MODEL_COLORS.map((color) => [color.hex, 0]))
  for (const hex of used) {
    const key = hex?.toLowerCase()
    if (key && counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: string = MODEL_COLORS[0].hex
  for (const { hex } of MODEL_COLORS) if ((counts.get(hex) ?? 0) < (counts.get(best) ?? 0)) best = hex
  return best
}
