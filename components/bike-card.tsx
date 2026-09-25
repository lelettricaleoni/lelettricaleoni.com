import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CardTagRow } from '@/components/card-tag-row'
import { shortId } from '@/lib/utils'
import { priceForDay } from '@/lib/bike-pricing'
import type { BikeModel, BikeModelTranslation, BikeCategory, RouteBikeCategory } from '@/lib/db'

interface BikeCardProps {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  routeCategory?: RouteBikeCategory | null
  media: ReactNode
  lang: string
  dict: { bikes: Record<string, string> }
}

// Stessa tecnica grid-rows-subgrid di RouteCard: le quattro fasce (media,
// titolo, etichette, prezzo) sono righe della griglia esterna, non della card,
// così restano allineate fra card vicine anche quando un titolo va su due righe.
// Le etichette stanno sotto il titolo e non sulla foto, come nei giri: un'etichetta
// appoggiata a un angolo copre una parte dell'unica cosa che la card deve mostrare.
export function BikeCard({ model, translation, category, routeCategory, media, lang, dict }: BikeCardProps) {
  const d = dict.bikes

  // day1Price non è mai null nello schema e il giorno 1 è sempre entro
  // maxRentalDays (che è almeno 1): priceForDay ritorna null solo per un
  // giorno che la categoria non offre, e il giorno 1 non lo è mai.
  const priceFrom = priceForDay(category, 1) ?? 0

  return (
    <Link
      href={`/${lang}/bikes/${shortId(model.id)}`}
      className="group grid grid-cols-1 grid-rows-subgrid row-span-4 min-w-0 gap-y-3 mb-6 rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow [&>*]:min-w-0"
    >
      <div className="relative h-48 bg-white overflow-hidden">
        {media}
      </div>

      <h3 className="px-4 font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
        {translation.name}
      </h3>

      <CardTagRow>
        <Badge variant="secondary" className="shrink-0 text-xs">{category.name}</Badge>
        {routeCategory && <Badge variant="outline" className="shrink-0 text-xs">{routeCategory.name}</Badge>}
      </CardTagRow>

      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground">
          {d.from_price} <span className="font-bold text-[#1e3a5f]">€{priceFrom}</span> {d.price_per_day}
        </p>
      </div>
    </Link>
  )
}
