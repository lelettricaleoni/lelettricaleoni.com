import { eq, and, asc, sql } from 'drizzle-orm'
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

export async function getBikeModelDetailData(lang: Locale, id: string) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('bike-units')

  const [model] = await db.select().from(bikeModels).where(
    and(sql`left(${bikeModels.id}::text, 8) = ${id}`, eq(bikeModels.isPublished, true))
  )
  if (!model) return null

  // Taggato con l'uuid pieno del modello, non con lo short id dell'URL: le
  // action admin in lib/actions/bike-models.ts chiamano già
  // updateTag(`bike-model-${id}`) con quello stesso uuid pieno (il form
  // admin non vede mai lo short id) — deve combaciare esattamente, altrimenti
  // una modifica non invaliderebbe mai questa voce di cache.
  cacheTag(`bike-model-${model.id}`)

  const [translation] = await db.select().from(bikeModelTranslations).where(
    and(eq(bikeModelTranslations.bikeModelId, model.id), eq(bikeModelTranslations.locale, lang))
  )
  const [category] = await db.select().from(bikeCategories).where(eq(bikeCategories.id, model.categoryId))

  const unitsInGarage = await db
    .select({ size: bikeSizes, version: bikeVersions })
    .from(bikeUnits)
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .where(eq(bikeUnits.bikeModelId, model.id))

  const sizesInGarage = dedupeById(unitsInGarage.map((u) => u.size))
  const versionsInGarage = dedupeById(unitsInGarage.map((u) => u.version))
  // Nessuna unità: equivalente a un modello non pubblicato — stessa regola
  // della lista, applicata anche qui in caso di link diretto a un modello
  // appena svuotato dal garage.
  if (sizesInGarage.length === 0) return null

  const rawMedia = await db.select().from(media)
    .where(eq(media.bikeModelId, model.id))
    .orderBy(media.displayOrder)

  // Un video senza manifesto pronto viene ignorato, non mostrato "in
  // caricamento": il worker non trascodifica ancora i sorgenti dei modelli
  // di bici (journal 2026-09-17), quindi oggi questo filtra sempre fuori i
  // video — le foto restano. Quando quel gap si chiude, funziona da solo.
  const allMedia = (await Promise.all(
    rawMedia.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )).filter((m): m is NonNullable<typeof m> => m !== null)

  return { model, translation, category, allMedia, sizesInGarage, versionsInGarage }
}
