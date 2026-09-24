import { BikeCard } from '@/components/bike-card'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
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
            media={<BikeCardMediaAsync model={model} title={translation.name} />}
            lang={lang}
            dict={dict}
          />
        ))}
      </div>
    </div>
  )
}
