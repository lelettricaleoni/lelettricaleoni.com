import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { shortId } from '@/lib/utils'
import { priceForDay } from '@/lib/bike-pricing'
import type { BikeModel, BikeModelTranslation, BikeCategory } from '@/lib/db'

interface BikeCardProps {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  media: ReactNode
  lang: string
  dict: { bikes: Record<string, string> }
}

// Stessa tecnica grid-rows-subgrid di RouteCard: le tre fasce (media, titolo,
// prezzo) sono righe della griglia esterna, non della card, così restano
// allineate fra card vicine anche quando un titolo va su due righe.
export function BikeCard({ model, translation, category, media, lang, dict }: BikeCardProps) {
  const d = dict.bikes

  // day1Price non è mai null nello schema e il giorno 1 è sempre entro
  // maxRentalDays (che è almeno 1): priceForDay ritorna null solo per un
  // giorno che la categoria non offre, e il giorno 1 non lo è mai.
  const priceFrom = priceForDay(category, 1) ?? 0

  return (
    <Link
      href={`/${lang}/bikes/${shortId(model.id)}`}
      className="group grid grid-cols-1 grid-rows-subgrid row-span-3 min-w-0 gap-y-3 mb-6 rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow [&>*]:min-w-0"
    >
      <div className="relative h-48 bg-[#c8dae8] overflow-hidden">
        {media}
        <Badge variant="secondary" className="absolute top-3 right-3 shadow-sm z-10">
          {category.name}
        </Badge>
      </div>

      <h3 className="px-4 font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
        {translation.name}
      </h3>

      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground">
          {d.from_price} <span className="font-bold text-[#1e3a5f]">€{priceFrom}</span> {d.price_per_day}
        </p>
      </div>
    </Link>
  )
}
