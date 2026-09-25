import { eq } from 'drizzle-orm'
import { db, media } from '@/lib/db'
import type { BikeModel } from '@/lib/db'
import { resolveReadyMedia } from '@/lib/media'
import { CardMedia } from './card-media'

interface BikeCardMediaAsyncProps {
  model: BikeModel
  title: string
}

// Stessa forma di RouteCardMediaAsync, senza la parte GPX/mappa che le bici
// non hanno. Un video senza manifesto pronto viene scartato, non mostra un
// segnaposto "in caricamento" — il worker non trascodifica ancora i video
// dei modelli di bici (journal 2026-09-17), quindi qui oggi non arriva mai
// un video pronto, solo foto.
export async function BikeCardMediaAsync({ model, title }: BikeCardMediaAsyncProps) {
  const mediaItems = await db
    .select()
    .from(media)
    .where(eq(media.bikeModelId, model.id))
    .orderBy(media.displayOrder)

  const [coverMedia] = await resolveReadyMedia(mediaItems)

  return <CardMedia media={coverMedia} title={title} />
}
