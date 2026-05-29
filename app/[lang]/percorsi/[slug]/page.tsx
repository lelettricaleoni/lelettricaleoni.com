import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { eq, and } from 'drizzle-orm'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RouteGallery } from '@/components/route-gallery'
import { RouteMapLoader } from '@/components/route-map-loader'
import { RouteGpxModal } from '@/components/route-gpx-modal'
import { RouteShareModal } from '@/components/route-share-modal'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { s3, R2_BUCKET, r2PublicUrl } from '@/lib/r2'
import { parseGpxPoints } from '@/lib/gpx'

export const revalidate = 3600

export async function generateStaticParams() {
  try {
    const published = await db.select({ slug: routes.slug }).from(routes).where(eq(routes.isPublished, true))
    const langs = ['it', 'en', 'de']
    return langs.flatMap((lang) => published.map(({ slug }) => ({ lang, slug })))
  } catch {
    // DB non raggiungibile in build (env var mancanti) → pagine generate on-demand
    return []
  }
}

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params
  if (!hasLocale(lang)) return {}

  const [route] = await db.select().from(routes).where(and(eq(routes.slug, slug), eq(routes.isPublished, true)))
  if (!route) return {}

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )
  const [coverPhoto] = await db.select().from(routePhotos).where(
    and(eq(routePhotos.routeId, route.id), eq(routePhotos.displayOrder, 0))
  )

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? slug
  const description = translation?.description?.slice(0, 155) ?? ''
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage }], url: `${siteUrl}/${lang}/percorsi/${slug}` },
    alternates: {
      canonical: `${siteUrl}/${lang}/percorsi/${slug}`,
      languages: {
        it: `${siteUrl}/it/percorsi/${slug}`,
        en: `${siteUrl}/en/percorsi/${slug}`,
        de: `${siteUrl}/de/percorsi/${slug}`,
        'x-default': `${siteUrl}/it/percorsi/${slug}`,
      },
    },
  }
}

export default async function RouteDetailPage({
  params,
}: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const d = dict.percorsi

  const [route] = await db.select().from(routes).where(and(eq(routes.slug, slug), eq(routes.isPublished, true)))
  if (!route) notFound()

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )

  const photos = await db.select().from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  const coverPhoto = photos[0]

  let gpxPoints: [number, number][] = []
  if (route.gpxKey) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: route.gpxKey }))
      const chunks: Buffer[] = []
      for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
      gpxPoints = parseGpxPoints(Buffer.concat(chunks).toString('utf-8'))
    } catch {
      gpxPoints = []
    }
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const difficultyLabel: Record<string, string> = {
    easy: d.difficulty_easy, medium: d.difficulty_medium,
    hard: d.difficulty_hard, expert: d.difficulty_expert,
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ExercisePlan',
    name: translation?.name ?? slug,
    description: translation?.description,
    url: `${siteUrl}/${lang}/percorsi/${slug}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    exerciseType: 'Cycling',
    associatedAnatomy: route.bikeTypes,
    provider: { '@type': 'LocalBusiness', name: 'Lelettrica di Leoni Gabriele', url: siteUrl },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-8 space-y-8">
        {/* Back */}
        <Link href={`/${lang}/percorsi`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#366DA1]">
          <ArrowLeft size={14} /> {d.back_to_list}
        </Link>

        {/* Hero */}
        {coverPhoto && (
          <div className="relative h-64 sm:h-80 rounded-2xl overflow-hidden">
            <Image
              src={r2PublicUrl(coverPhoto.storageKey)}
              alt={translation?.name ?? slug}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
            />
            <span className="absolute top-4 right-4 text-sm font-semibold px-3 py-1.5 rounded-full bg-white/90 text-[#1e3a5f]">
              {difficultyLabel[route.difficulty]}
            </span>
          </div>
        )}

        {/* Title + bike types */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f]">
            {translation?.name ?? slug}
          </h1>
          <div className="flex flex-wrap gap-2">
            {route.bikeTypes.map((type) => (
              <Badge key={type} variant="secondary">{type}</Badge>
            ))}
          </div>
        </div>

        {/* Mappa GPX */}
        {gpxPoints.length > 1 && <RouteMapLoader points={gpxPoints} />}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/40 rounded-xl p-4">
          {route.distanceKm && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">{route.distanceKm}</p>
              <p className="text-xs text-muted-foreground">{d.stat_distance}</p>
            </div>
          )}
          {route.elevationM != null && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">{route.elevationM}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-0.5"><TrendingUp size={11} /> {d.stat_elevation}</p>
            </div>
          )}
          {route.durationMin && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">
                {Math.floor(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}
              </p>
              <p className="text-xs text-muted-foreground">{d.stat_duration}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-[#1e3a5f] capitalize">
              {d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}
            </p>
            <p className="text-xs text-muted-foreground">{d.stat_surface}</p>
          </div>
        </div>

        {/* Start point */}
        {translation?.startPointLabel && (
          <p className="text-sm text-muted-foreground">📍 {translation.startPointLabel}</p>
        )}

        {/* Description */}
        {translation?.description && (
          <div className="prose prose-slate max-w-none">
            <p className="text-base leading-relaxed">{translation.description}</p>
          </div>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <section className="space-y-3">
            <RouteGallery photos={photos} routeName={translation?.name ?? slug} />
          </section>
        )}

        {/* Links + Share */}
        <div className="flex flex-wrap gap-3 pt-4 border-t">
          {route.stravaUrl && (
            <Button asChild variant="outline" size="sm" className="border-orange-400 text-orange-600 hover:bg-orange-50">
              <a href={route.stravaUrl} target="_blank" rel="noopener noreferrer">{d.open_strava}</a>
            </Button>
          )}
          {route.komootUrl && (
            <Button asChild variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50">
              <a href={route.komootUrl} target="_blank" rel="noopener noreferrer">{d.open_komoot}</a>
            </Button>
          )}
          {route.gpxKey && (
            <RouteGpxModal
              slug={slug}
              routeName={translation?.name ?? slug}
              dict={dict}
            />
          )}
          <RouteShareModal
            url={`${siteUrl}/${lang}/percorsi/${slug}`}
            routeName={translation?.name ?? slug}
            dict={dict}
          />
        </div>

      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
