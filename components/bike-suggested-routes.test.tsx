import { describe, it, expect, vi } from 'vitest'
import { Suspense, type ReactElement } from 'react'
import type { Route, RouteTranslation } from '@/lib/db'

// Foglia con accesso al database (crea il client Postgres all'import): il
// test guarda solo la struttura dell'albero prodotto da BikeSuggestedRoutes,
// non ciò che questa foglia renderizza.
vi.mock('@/components/route-card-media-async', () => ({ RouteCardMediaAsync: () => null }))

import { BikeSuggestedRoutes } from './bike-suggested-routes'
import { RouteCard } from '@/components/route-card'

function suggested(id: string) {
  return {
    route: { id } as Route,
    translation: { name: `Route ${id}` } as RouteTranslation,
  }
}

// Scende nell'albero di elementi restituito dal componente (nessun DOM):
// raccoglie i props di ogni <RouteCard>.
function findRouteCards(node: unknown): ReactElement<{ media: ReactElement }>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(findRouteCards)
  const el = node as ReactElement<{ children?: unknown; media?: ReactElement }>
  const found = el.type === RouteCard ? [el as ReactElement<{ media: ReactElement }>] : []
  return [...found, ...findRouteCards(el.props?.children)]
}

describe('BikeSuggestedRoutes', () => {
  it('wraps every card media in Suspense so a slow media lookup cannot block the whole page', () => {
    const tree = BikeSuggestedRoutes({
      routes: [suggested('a'), suggested('b'), suggested('c')],
      lang: 'it',
      dict: { routes: {} },
      title: 'Percorsi consigliati con questa bici',
    })

    const cards = findRouteCards(tree)
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.props.media.type).toBe(Suspense)
    }
  })

  it('renders nothing when there are no suggested routes', () => {
    expect(BikeSuggestedRoutes({ routes: [], lang: 'it', dict: { routes: {} }, title: 'x' })).toBeNull()
  })
})
