import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Route, RouteTranslation } from '@/lib/db'
import { formatRouteKm } from './route-format'
import { RouteCard } from '@/components/route-card'

describe('formatRouteKm', () => {
  it('rounds to whole kilometres for the list, where there is no room for decimals', () => {
    expect(formatRouteKm('63.50', 'it', 'whole')).toBe('64')
    expect(formatRouteKm('63.49', 'it', 'whole')).toBe('63')
    expect(formatRouteKm('9.00', 'en', 'whole')).toBe('9')
  })

  it('keeps one decimal on the route page, with the separator of the language', () => {
    expect(formatRouteKm('63.50', 'it', 'detail')).toBe('63,5')
    expect(formatRouteKm('63.50', 'de', 'detail')).toBe('63,5')
    expect(formatRouteKm('63.50', 'en', 'detail')).toBe('63.5')
  })

  it('does not print a trailing ,0 for a round distance', () => {
    expect(formatRouteKm('20.00', 'it', 'detail')).toBe('20')
  })

  it('takes a number too', () => {
    expect(formatRouteKm(12.34, 'it', 'whole')).toBe('12')
  })
})

describe('RouteCard distance', () => {
  const render = (distanceKm: string | null) =>
    renderToStaticMarkup(
      createElement(RouteCard, {
        route: { id: 'aa7da601-1111-2222-3333-444455556666', distanceKm, elevationM: 700, durationMin: 95, difficulty: 'medium', bikeTypes: [] } as unknown as Route,
        translation: { name: 'Giro' } as RouteTranslation,
        media: null,
        lang: 'it',
        dict: { routes: {} },
      })
    )

  it('shows whole kilometres', () => {
    const html = render('63.50')
    expect(html).toContain('64 km')
    expect(html).not.toContain('63.50')
    expect(html).not.toContain('63,5')
  })

  it('still shows a dash for a route with no distance', () => {
    expect(render(null)).not.toContain(' km')
  })
})
