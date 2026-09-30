import { describe, it, expect } from 'vitest'
import { truncateAtBoundary, buildRouteDescription, META_DESCRIPTION_MAX } from './route-seo'

const LABELS = { distance: 'Distanza', elevation: 'Dislivello', difficulty: 'Difficile' }

describe('truncateAtBoundary', () => {
  it('leaves a short text alone', () => {
    expect(truncateAtBoundary('Un giro breve.', 50)).toBe('Un giro breve.')
  })

  it('folds line breaks and runs of spaces into single spaces', () => {
    expect(truncateAtBoundary('Prima riga.\r\n\r\nSeconda   riga.', 100)).toBe('Prima riga. Seconda riga.')
  })

  it('cuts at the end of the last sentence that fits, without an ellipsis', () => {
    const text = 'Si parte da Dro lungo il Sarca. Poi si sale verso Sarche e si prosegue nel bosco fino alla malga.'
    expect(truncateAtBoundary(text, 60)).toBe('Si parte da Dro lungo il Sarca.')
  })

  it('cuts at a word, never inside one, when no sentence ends early enough', () => {
    const text = 'Partendo da Dro si percorre la pista ciclabile lungo il Sarca fino a Pietramurata senza fermarsi mai'
    const out = truncateAtBoundary(text, 50)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(text.startsWith(out.slice(0, -1).trimEnd())).toBe(true)
    // The kept part ends on a whole word of the original.
    expect(text.slice(out.slice(0, -1).trimEnd().length, out.slice(0, -1).trimEnd().length + 1)).toBe(' ')
  })

  it('never returns more than the limit', () => {
    const text = 'parola '.repeat(80)
    for (const max of [10, 40, 100, 155]) {
      expect(truncateAtBoundary(text, max).length).toBeLessThanOrEqual(max)
    }
  })
})

describe('buildRouteDescription', () => {
  const body = 'Partendo da Dro si percorre la pista ciclabile lungo il Sarca fino a Pietramurata, dove si stacca su qualche breve trail in sterrato prima di raggiungere Sarche.'

  it('leads with the numbers that tell one route from another', () => {
    const out = buildRouteDescription({
      lang: 'it', description: body, distanceKm: '63.80', elevationM: 1905, labels: LABELS,
    })
    // Italian writes four digits without a separator (1905, as the page itself does).
    expect(out.startsWith('Distanza 63,8 km · Dislivello 1905 m · Difficile — Partendo da Dro')).toBe(true)
  })

  it('formats the numbers for the language of the page', () => {
    const out = buildRouteDescription({
      lang: 'en', description: 'From Dro along the Sarca.', distanceKm: '63.80', elevationM: 1905,
      labels: { distance: 'Distance', elevation: 'Elevation gain', difficulty: 'Hard' },
    })
    expect(out).toBe('Distance 63.8 km · Elevation gain 1,905 m · Hard — From Dro along the Sarca.')
  })

  it('stays within the length Google shows', () => {
    const out = buildRouteDescription({
      lang: 'it', description: body.repeat(3), distanceKm: '63.80', elevationM: 1905, labels: LABELS,
    })
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX)
    expect(out.endsWith('…') || out.endsWith('.')).toBe(true)
  })

  it('skips a figure the route does not have instead of printing a blank one', () => {
    const out = buildRouteDescription({
      lang: 'it', description: 'Un giro.', distanceKm: null, elevationM: null, labels: LABELS,
    })
    expect(out).toBe('Difficile — Un giro.')
    expect(out).not.toMatch(/null|undefined|NaN/)
  })

  it('still says something when the route has no description', () => {
    const out = buildRouteDescription({
      lang: 'it', description: undefined, distanceKm: '10.00', elevationM: 100, labels: LABELS,
    })
    expect(out).toBe('Distanza 10 km · Dislivello 100 m · Difficile')
  })
})
