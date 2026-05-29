import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RouteFilters } from '@/components/route-filters'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.percorsi.page_title,
    description: dict.percorsi.page_subtitle,
    alternates: {
      canonical: `${siteUrl}/${lang}/percorsi`,
      languages: {
        it: `${siteUrl}/it/percorsi`,
        en: `${siteUrl}/en/percorsi`,
        de: `${siteUrl}/de/percorsi`,
        'x-default': `${siteUrl}/it/percorsi`,
      },
    },
  }
}

export default async function PercorsiPage({
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

        const [coverPhoto] = await db
          .select()
          .from(routePhotos)
          .where(and(eq(routePhotos.routeId, route.id), eq(routePhotos.displayOrder, 0)))

        return translation ? { route, translation, coverPhoto } : null
      })
    )
  ).filter((i) => i !== null)

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.percorsi.page_title,
    url: `${siteUrl}/${lang}/percorsi`,
    numberOfItems: routesWithData.length,
    itemListElement: routesWithData.map(({ route, translation }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/percorsi/${route.slug}`,
      name: translation?.name ?? route.slug,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      {/* Header a piena larghezza come le sezioni home */}
      <section className="w-full bg-[#f0f6fb] border-b border-border pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.percorsi.page_title}</h1>
          <p className="text-muted-foreground mt-2">{dict.percorsi.page_subtitle}</p>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <RouteFilters routes={routesWithData} lang={lang} dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
