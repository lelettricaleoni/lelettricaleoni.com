import { Suspense } from 'react'
import { BikeCard } from '@/components/bike-card'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import { Skeleton } from '@/components/ui/skeleton'
import type { BikeModel, BikeModelTranslation, BikeCategory } from '@/lib/db'

interface SuggestedBike {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
}

export function RouteSuggestedBikes({
  bikes, lang, dict, title,
}: {
  bikes: SuggestedBike[]
  lang: string
  dict: { bikes: Record<string, string> }
  title: string
}) {
  if (bikes.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-[#1e3a5f]">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0">
        {bikes.map(({ model, translation, category }) => (
          <BikeCard
            key={model.id}
            model={model}
            translation={translation}
            category={category}
            // Il media di ogni card fa query proprie e non cache-ate: senza un
            // confine Suspense per card, la pagina di dettaglio del percorso
            // aspetterebbe N query concorrenti prima di mostrare qualunque cosa
            // — stessa regola di /bikes e delle card dei percorsi (STATE.md).
            media={
              <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
                <BikeCardMediaAsync model={model} title={translation.name} />
              </Suspense>
            }
            lang={lang}
            dict={dict}
          />
        ))}
      </div>
    </div>
  )
}
