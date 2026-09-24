import { describe, it, expect, vi } from 'vitest'
import { Suspense, type ReactElement } from 'react'
import type { BikeModel, BikeModelTranslation, BikeCategory } from '@/lib/db'

// Foglia con accesso al database (crea il client Postgres all'import): il
// test guarda solo la struttura dell'albero prodotto da RouteSuggestedBikes,
// non ciò che questa foglia renderizza.
vi.mock('@/components/bike-card-media-async', () => ({ BikeCardMediaAsync: () => null }))

import { RouteSuggestedBikes } from './route-suggested-bikes'
import { BikeCard } from '@/components/bike-card'

function bike(id: string) {
  return {
    model: { id } as BikeModel,
    translation: { name: `Bike ${id}` } as BikeModelTranslation,
    category: { name: 'eMTB Front' } as BikeCategory,
  }
}

// Scende nell'albero di elementi restituito dal componente (nessun DOM):
// raccoglie i props di ogni <BikeCard>.
function findBikeCards(node: unknown): ReactElement<{ media: ReactElement }>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(findBikeCards)
  const el = node as ReactElement<{ children?: unknown; media?: ReactElement }>
  const found = el.type === BikeCard ? [el as ReactElement<{ media: ReactElement }>] : []
  return [...found, ...findBikeCards(el.props?.children)]
}

describe('RouteSuggestedBikes', () => {
  it('wraps every card media in Suspense so a slow media lookup cannot block the whole page', () => {
    const tree = RouteSuggestedBikes({
      bikes: [bike('a'), bike('b'), bike('c')],
      lang: 'it',
      dict: { bikes: {} },
      title: 'Bici adatte a questo giro',
    })

    const cards = findBikeCards(tree)
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.props.media.type).toBe(Suspense)
    }
  })

  it('renders nothing when there are no suggested bikes', () => {
    expect(RouteSuggestedBikes({ bikes: [], lang: 'it', dict: { bikes: {} }, title: 'x' })).toBeNull()
  })
})
