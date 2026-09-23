import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { BikeFilters } from '@/components/bike-filters'
import { BikeCardMediaAsync } from '@/components/bike-card-media-async'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { Skeleton } from '@/components/ui/skeleton'
import { FlagsExplorer } from '@/components/flags-explorer'
import { shortId } from '@/lib/utils'
import { getFlags } from '@/lib/flags'
import { getBikeModelsListData } from '@/lib/bikes-data'
import { buildSocialMetadata } from '@/lib/metadata'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  await connection()
  const flags = await getFlags()
  if (!flags.bikes) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.bikes.page_title,
    description: dict.bikes.page_subtitle,
    ...buildSocialMetadata({
      lang, title: dict.bikes.page_title, description: dict.bikes.page_subtitle, url: `${siteUrl}/${lang}/bikes`,
    }),
    alternates: {
      canonical: `${siteUrl}/${lang}/bikes`,
      languages: {
        it: `${siteUrl}/it/bikes`,
        en: `${siteUrl}/en/bikes`,
        de: `${siteUrl}/de/bikes`,
        'x-default': `${siteUrl}/it/bikes`,
      },
    },
  }
}

export default async function BikesPage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  await connection()
  const flags = await getFlags()
  if (!flags.bikes) notFound()

  const modelsWithTranslations = await getBikeModelsListData(lang as 'it' | 'en' | 'de')
  const dict = await getDictionary(lang)

  const modelsWithData = modelsWithTranslations.map(({ model, translation, category, sizesInGarage }) => ({
    model,
    translation,
    category,
    sizesInGarage,
    media: (
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
        <BikeCardMediaAsync model={model} title={translation.name} />
      </Suspense>
    ),
  }))

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.bikes.page_title,
    url: `${siteUrl}/${lang}/bikes`,
    numberOfItems: modelsWithData.length,
    itemListElement: modelsWithData.map(({ model, translation: t }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/bikes/${shortId(model.id)}`,
      name: t.name,
    })),
  }

  return (
    <>
      <FlagsExplorer flags={flags} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
      <main className="w-full pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <div>
            <SectionViewTracker name="bikes_list" />
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.bikes.page_title}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">{dict.bikes.page_subtitle}</p>
          </div>
          <BikeFilters models={modelsWithData} lang={lang} dict={dict} />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
