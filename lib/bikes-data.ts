import { eq, and, asc } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import {
  db, bikeModels, bikeModelTranslations, bikeCategories, bikeUnits, bikeSizes,
  bikeVersions, media,
} from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'

type Locale = 'it' | 'en' | 'de'

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()]
}

// Un modello compare solo se ha almeno una bici fisica in garage: l'inner
// join a bike_units è quello che rende "nessuna bici in garage" equivalente
// a "non in lista", senza un controllo di esistenza separato. selectDistinct
// perché un modello con più unità altrimenti si ripeterebbe una volta per
// unità — dedup sulle sole colonne selezionate (model/translation/category),
// non su bike_units.
export async function getBikeModelsListData(lang: Locale) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('bike-models')
  cacheTag('bike-units')

  const models = await db
    .selectDistinct({ model: bikeModels, translation: bikeModelTranslations, category: bikeCategories })
    .from(bikeModels)
    .innerJoin(
      bikeModelTranslations,
      and(eq(bikeModelTranslations.bikeModelId, bikeModels.id), eq(bikeModelTranslations.locale, lang))
    )
    .innerJoin(bikeCategories, eq(bikeCategories.id, bikeModels.categoryId))
    .innerJoin(bikeUnits, eq(bikeUnits.bikeModelId, bikeModels.id))
    .where(eq(bikeModels.isPublished, true))
    .orderBy(asc(bikeModels.displayOrder))

  // Taglie davvero in garage, una sola query per tutti i modelli insieme —
  // non una query per modello dentro il map sotto: la stessa forma N+1 che
  // ha bloccato /routes due volte (STATE.md, 2026-09-15) non va reintrodotta
  // qui.
  const sizeLinks = await db
    .selectDistinct({ bikeModelId: bikeUnits.bikeModelId, size: bikeSizes })
    .from(bikeUnits)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))

  return models.map(({ model, translation, category }) => ({
    model,
    translation,
    category,
    sizesInGarage: dedupeById(
      sizeLinks.filter((l) => l.bikeModelId === model.id).map((l) => l.size)
    ),
  }))
}
