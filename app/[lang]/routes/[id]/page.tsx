import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { eq, and, sql } from 'drizzle-orm'
import { ArrowLeft, Ruler, TrendingUp, Clock, Layers } from 'lucide-react'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { RouteGallery } from '@/components/route-gallery'
import { BikeTypeIcon, bikeTypeBadgeClass } from '@/components/bike-type-icon'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { RouteFlyoverLoader } from '@/components/route-flyover-loader'
import { RouteGpxModal } from '@/components/route-gpx-modal'
import { RouteShareModal } from '@/components/route-share-modal'
import { RouteExternalLinks } from '@/components/route-external-links'
import { RouteViewTracker } from '@/components/route-view-tracker'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { s3, R2_BUCKET, r2PublicUrl } from '@/lib/r2'
import { parseGpxPoints } from '@/lib/gpx'
import { shortRouteId } from '@/lib/utils'

export const revalidate = 3600

export async function generateStaticParams() {
  try {
    const published = await db.select({ id: routes.id }).from(routes).where(eq(routes.isPublished, true))
    const langs = ['it', 'en', 'de']
    return langs.flatMap((lang) => published.map(({ id }) => ({ lang, id: shortRouteId(id) })))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { lang, id } = await params
  if (!hasLocale(lang)) return {}

  const [route] = await db.select().from(routes).where(
    and(sql`left(${routes.id}::text, 8) = ${id}`, eq(routes.isPublished, true))
  )
  if (!route) return {}

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )
  const [coverPhoto] = await db.select().from(routePhotos).where(
    and(eq(routePhotos.routeId, route.id), eq(routePhotos.displayOrder, 0))
  )

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? id
  const description = translation?.description?.slice(0, 155) ?? ''
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage }], url: `${siteUrl}/${lang}/routes/${id}` },
    alternates: {
      canonical: `${siteUrl}/${lang}/routes/${id}`,
      languages: {
        it: `${siteUrl}/it/routes/${id}`,
        en: `${siteUrl}/en/routes/${id}`,
        de: `${siteUrl}/de/routes/${id}`,
        'x-default': `${siteUrl}/it/routes/${id}`,
      },
    },
  }
}

export default async function RouteDetailPage({
  params,
}: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const d = dict.routes

  const [route] = await db.select().from(routes).where(
    and(sql`left(${routes.id}::text, 8) = ${id}`, eq(routes.isPublished, true))
  ).catch((err: unknown) => { console.error('[RouteDetailPage] DB error:', err); throw err })
  if (!route) notFound()

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )

  const photos = await db.select().from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  const coverPhoto = photos[0]

  let gpxPoints: [number, number, number][] = []
  if (route.gpxKey) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: route.gpxKey }))
      const chunks: Buffer[] = []
      for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
      gpxPoints = parseGpxPoints(Buffer.concat(chunks).toString('utf-8'))
    } catch (err) {
      console.error('[RouteDetailPage] R2/GPX error:', err)
      gpxPoints = []
    }
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ExercisePlan',
    name: translation?.name ?? id,
    description: translation?.description,
    url: `${siteUrl}/${lang}/routes/${id}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    exerciseType: 'Cycling',
    associatedAnatomy: route.bikeTypes,
    provider: { '@type': 'LocalBusiness', name: 'Lelettrica di Leoni Gabriele', url: siteUrl },
  }

  return (
    <>
      <RouteViewTracker routeId={id} difficulty={route.difficulty} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pt-24 pb-8">
      <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
        {/* Back */}
        <Link href={`/${lang}/routes`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#366DA1]">
          <ArrowLeft size={14} /> {d.back_to_list}
        </Link>

        {/* Title + bike types + difficulty */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f]">
            {translation?.name ?? id}
          </h1>
          <div className="flex flex-wrap gap-2">
            {route.bikeTypes.map((type) => (
              <Badge key={type} variant="outline" className={`flex items-center gap-1 font-medium ${bikeTypeBadgeClass(type)}`}>
                <BikeTypeIcon type={type} size={13} />
                {type}
              </Badge>
            ))}
            {route.difficulty && (
              <DifficultyBadge
                difficulty={route.difficulty}
                label={d[`difficulty_${route.difficulty}` as keyof typeof d] ?? route.difficulty}
              />
            )}
          </div>
        </div>

        {/* Map / GPX flyover */}
        {gpxPoints.length > 1 && <RouteFlyoverLoader points={gpxPoints} difficulty={route.difficulty} />}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {route.distanceKm && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
              <Ruler size={20} className="text-[#366DA1]" />
              <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
                {route.distanceKm}<span className="text-sm font-normal ml-0.5">km</span>
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_distance}</p>
            </div>
          )}
          {route.elevationM != null && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
              <TrendingUp size={20} className="text-[#366DA1]" />
              <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
                {route.elevationM}<span className="text-sm font-normal ml-0.5">m</span>
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_elevation}</p>
            </div>
          )}
          {route.durationMin && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
              <Clock size={20} className="text-[#366DA1]" />
              <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
                {Math.floor(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_duration}</p>
            </div>
          )}
          <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
            <Layers size={20} className="text-[#366DA1]" />
            <p className="text-2xl font-bold text-[#1e3a5f] leading-none capitalize">
              {d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_surface}</p>
          </div>
        </div>

        {/* Description */}
        {translation?.description && (
          <div className="prose prose-slate max-w-none">
            <p className="text-base leading-relaxed">{translation.description}</p>
          </div>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <section className="space-y-3">
            <RouteGallery photos={photos} routeName={translation?.name ?? id} />
          </section>
        )}

        {/* Links + Share */}
        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <RouteExternalLinks
            stravaUrl={route.stravaUrl}
            komootUrl={route.komootUrl}
            openStrava={d.open_strava}
            openKomoot={d.open_komoot}
          />
          {route.gpxKey && (
            <RouteGpxModal
              shortId={id}
              routeName={translation?.name ?? id}
              dict={dict}
            />
          )}
          <RouteShareModal
            url={`${siteUrl}/${lang}/routes/${id}`}
            routeName={translation?.name ?? id}
            dict={dict}
          />
        </div>

      </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
