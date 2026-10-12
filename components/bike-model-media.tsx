import { Suspense, type ReactNode } from 'react'
import { inArray } from 'drizzle-orm'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import { Skeleton } from '@/components/ui/skeleton'
import { db, bikeModels } from '@/lib/db'

/**
 * The first photo of each of these models, ready to be placed anywhere (a server component per model, each in its own Suspense so a slow
 * photo never holds the page): what the booking pages use to show a bike as a card. The container that holds it sets the size.
 */
export async function getModelMedia(models: { id: string; name: string }[]): Promise<Record<string, ReactNode>> {
  const ids = [...new Set(models.map((model) => model.id))]
  if (ids.length === 0) return {}
  const rows = await db.select().from(bikeModels).where(inArray(bikeModels.id, ids))
  return Object.fromEntries(models.flatMap((model) => {
    const row = rows.find((entry) => entry.id === model.id)
    if (!row) return []
    return [[model.id, (
      <Suspense key={model.id} fallback={<Skeleton className="h-full w-full rounded-none" />}>
        <BikeCardMediaAsync model={row} title={model.name} />
      </Suspense>
    )]]
  }))
}
