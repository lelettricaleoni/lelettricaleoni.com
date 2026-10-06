/*
 * Every integration the panel knows. The catalogue and the page of each integration are built from this list:
 * adding an integration is one entry here plus its own configuration. Pure data, safe to import anywhere; the
 * icon is a name the interface maps to a component.
 */
export type IntegrationIcon = 'calendar'

export interface IntegrationDefinition {
  id: string
  name: string
  /** One line, for the card in the catalogue. */
  summary: string
  /** What it does, for the Overview tab. */
  description: string
  /** What leaves for the outside service: said plainly, because it is personal data. */
  dataSent: string[]
  /** What it will never do or send. */
  notDone: string[]
  category: string
  icon: IntegrationIcon
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    summary: 'Every rental and maintenance appears as an event in a Google calendar.',
    description:
      'When you add, move or cancel a rental or a maintenance in Bookings, the matching all-day event is created, ' +
      'updated or removed in a Google calendar of your choice, so you see the bookings on your phone without opening ' +
      'the panel. It works in one direction only: the Bookings calendar stays the source of truth, and changing an ' +
      'event in Google does not change the panel.',
    dataSent: [
      'The bike (model, size, version) and the days of each rental or maintenance',
      'The customer name, and the phone number if you turn that option on',
      'The reason of a maintenance, if you write one',
    ],
    notDone: [
      'It never sends the amount of a rental',
      'It never sends the private notes you keep about a customer',
      'It never reads or changes the events you add by hand to the same calendar',
    ],
    category: 'Calendar',
    icon: 'calendar',
  },
]

export function getIntegrationDefinition(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id)
}
