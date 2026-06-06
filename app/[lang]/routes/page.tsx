import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import type { Metadata } from 'next'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RouteFilters } from '@/components/route-filters'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { s3, R2_BUCKET } from '@/lib/r2'
import { minioObjectExists, deriveHlsPrefix } from '@/lib/minio'
import { parseGpxPoints } from '@/lib/gpx'
import { gpxPointsToSvgPath, gpxBboxCenter } from '@/lib/gpx-svg'
import { shortRouteId } from '@/lib/utils'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.routes.page_title,
    description: dict.routes.page_subtitle,
    alternates: {
      canonical: `${siteUrl}/${lang}/routes`,
      languages: {
        it: `${siteUrl}/it/routes`,
        en: `${siteUrl}/en/routes`,
        de: `${siteUrl}/de/routes`,
        'x-default': `${siteUrl}/it/routes`,
      },
    },
  }
}

export default async function RoutesPage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)

  const publishedRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.isPublished, true))

  const routesWithData = (
    await Promise.all(
      publishedRoutes.map(async (route) => {
        const [translation] = await db
          .select()
          .from(routeTranslations)
          .where(and(
            eq(routeTranslations.routeId, route.id),
            eq(routeTranslations.locale, lang as 'it' | 'en' | 'de')
          ))

        const mediaItems = await db
          .select()
          .from(routePhotos)
          .where(eq(routePhotos.routeId, route.id))
          .orderBy(routePhotos.displayOrder)

        // Exclude videos whose HLS isn't ready yet
        const readyMedia = await Promise.all(
          mediaItems.map(async (m) => {
            if (m.mediaType !== 'video') return m
            const ready = await minioObjectExists(deriveHlsPrefix(m.storageKey) + 'playlist.m3u8')
            return ready ? m : null
          })
        )
        const coverMedia = readyMedia.find(Boolean) ?? undefined

        let gpxPath: string | undefined
        let mapCenter: { lat: number; lon: number; zoom: number } | undefined
        if (!coverMedia && route.gpxKey) {
          try {
            const res = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: route.gpxKey }))
            const chunks: Buffer[] = []
            for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
            const pts = parseGpxPoints(Buffer.concat(chunks).toString('utf-8'))
            gpxPath = gpxPointsToSvgPath(pts)
            mapCenter = gpxBboxCenter(pts)
          } catch { /* silently skip */ }
        }

        return translation ? { route, translation, coverMedia, gpxPath, mapCenter } : null
      })
    )
  ).filter((i) => i !== null)

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.routes.page_title,
    url: `${siteUrl}/${lang}/routes`,
    numberOfItems: routesWithData.length,
    itemListElement: routesWithData.map(({ route, translation: t }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/routes/${shortRouteId(route.id)}`,
      name: t?.name ?? shortRouteId(route.id),
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <div>
            <SectionViewTracker name="routes_list" />
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.routes.page_title}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">{dict.routes.page_subtitle}</p>
          </div>
          <RouteFilters routes={routesWithData} lang={lang} dict={dict} />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
