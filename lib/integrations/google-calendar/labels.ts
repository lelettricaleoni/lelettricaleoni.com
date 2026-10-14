import { MAINTENANCE_COLOR } from '@/lib/bike-colors'

/*
 * The labels of a Google calendar (its "event labels", generally available since 2026-07-07): a named colour of any shade, which an
 * event picks by id. A model of bike is one label (the id of the label is the id of the model, the name is the name of the model), and the
 * maintenance is one more, grey. Pure: no network, no database. A label that is not ours (Kevin's own, put by hand in Google Calendar) is
 * never changed or removed: the whole list is read, ours are merged in, and the whole list is written back (Google replaces it).
 */

export interface CalendarLabel {
  id: string
  /** `#rrggbb`. */
  backgroundColor: string
  name?: string
}

/** A calendar holds at most this many labels. */
export const MAX_LABELS = 200
/** The longest name we give a label (Google does not say a limit; this is well inside any). */
const NAME_MAX = 50

/** The id of the maintenance label: fixed, so the same label is found again at every sync. (Labels have UUID ids.) */
export const MAINTENANCE_LABEL_ID = '6d1b0a6e-6f0d-4c7a-9a39-5b0d3f1e2a10'

export interface ModelForLabel {
  id: string
  name: string
  color: string | null
}

const clip = (name: string) => (name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name)

/** The labels the calendar must have: one for each model that has a colour, and the maintenance one. */
export function wantedLabels(models: ModelForLabel[]): CalendarLabel[] {
  return [
    ...models.flatMap((model) => (model.color ? [{ id: model.id, backgroundColor: model.color.toLowerCase(), name: clip(model.name.trim() || 'Untitled') }] : [])),
    { id: MAINTENANCE_LABEL_ID, backgroundColor: MAINTENANCE_COLOR, name: 'Maintenance' },
  ]
}

export interface MergedLabels {
  labels: CalendarLabel[]
  /** Whether anything differs from what the calendar has: when not, nothing is written. */
  changed: boolean
  /** The calendar would go over `MAX_LABELS`: nothing is written. */
  tooMany: boolean
}

/** The labels of the calendar with ours in them: the ones of ours that exist are corrected in place, the missing ones appended, the others kept as they are. */
export function mergeLabels(existing: CalendarLabel[], wanted: CalendarLabel[]): MergedLabels {
  const labels = existing.map((label) => ({ ...label }))
  let changed = false
  for (const label of wanted) {
    const index = labels.findIndex((entry) => entry.id === label.id)
    if (index === -1) {
      labels.push({ ...label })
      changed = true
    } else if (labels[index].backgroundColor.toLowerCase() !== label.backgroundColor || labels[index].name !== label.name) {
      labels[index] = { ...labels[index], backgroundColor: label.backgroundColor, name: label.name }
      changed = true
    }
  }
  if (labels.length > MAX_LABELS) return { labels: existing, changed: false, tooMany: true }
  return { labels, changed, tooMany: false }
}
