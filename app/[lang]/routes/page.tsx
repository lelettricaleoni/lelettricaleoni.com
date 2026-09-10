import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RouteFilters } from '@/components/route-filters'
import { RouteCardMediaAsync } from '@/components/route-card-media-async'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { Skeleton } from '@/components/ui/skeleton'
import { listPublishedRoutes } from '@/lib/routes-data'
import { shortRouteId } from '@/lib/utils'
import { getFlags } from '@/lib/flags'


export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  // Without this the 404 would still carry the section's title and canonical
  if (!(await getFlags()).routes) return {}
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
  // Switched off the section behaves as if it were never built, not as an error
  if (!(await getFlags()).routes) notFound()

  const dict = await getDictionary(lang)

  // Only the fast DB-backed bits (text, stats, filters) block the page. Each card's media —
  // cover photo/video and GPX map preview — depends on R2 lookups that can be slow or
  // unreachable, so it's resolved in its own Suspense boundary instead of blocking everything else.
  const routesWithData = (await listPublishedRoutes(lang)).map(({ route, translation }) => ({
    route,
    translation,
    media: (
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
        <RouteCardMediaAsync route={route} routeName={translation.name} />
      </Suspense>
    ),
  }))

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
      <Navbar lang={lang} dict={dict} showRoutes={(await getFlags()).routes} />
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
