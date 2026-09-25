import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { MediaGallery } from '@/components/media-gallery'
import { BikeViewTracker } from '@/components/bike-view-tracker'
import { BikeContactButtons } from '@/components/bike-contact-buttons'
import { FlagsExplorer } from '@/components/flags-explorer'
import { r2PublicUrl } from '@/lib/r2'
import { getFlags } from '@/lib/flags'
import { getBikeModelDetailData } from '@/lib/bikes-data'
import { getSuggestedRoutesForBike } from '@/lib/routes-data'
import { BikeSuggestedRoutes } from '@/components/bike-suggested-routes'
import { priceForDay } from '@/lib/bike-pricing'
import { buildSocialMetadata } from '@/lib/metadata'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { lang, id } = await params
  if (!hasLocale(lang)) return {}
  await connection()
  const flags = await getFlags()
  if (!flags.bikes) return {}

  const data = await getBikeModelDetailData(lang as 'it' | 'en' | 'de', id)
  if (!data) return {}
  const { translation, allMedia } = data

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? id
  const description = translation?.description?.slice(0, 155) ?? ''
  const coverPhoto = allMedia.find((m) => m.mediaType === 'photo')
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    ...buildSocialMetadata({ lang, title, description, url: `${siteUrl}/${lang}/bikes/${id}`, image: { url: ogImage } }),
    alternates: {
      canonical: `${siteUrl}/${lang}/bikes/${id}`,
      languages: {
        it: `${siteUrl}/it/bikes/${id}`,
        en: `${siteUrl}/en/bikes/${id}`,
        de: `${siteUrl}/de/bikes/${id}`,
        'x-default': `${siteUrl}/it/bikes/${id}`,
      },
    },
  }
}

export default async function BikeDetailPage({
  params,
}: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!hasLocale(lang)) notFound()

  await connection()
  const flags = await getFlags()
  if (!flags.bikes) notFound()

  const dict = await getDictionary(lang)
  const d = dict.bikes

  const data = await getBikeModelDetailData(lang as 'it' | 'en' | 'de', id)
  if (!data) notFound()
  const { model, translation, category, routeCategory, allMedia, sizesInGarage, versionsInGarage } = data

  const coverPhoto = allMedia.find((m) => m.mediaType === 'photo')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  // A bike whose category has no terrain group (e.g. the classic city bike)
  // has nothing to suggest; and with the routes section switched off, a link
  // into it would lead to a 404.
  const suggestedRoutes = routeCategory && flags.routes
    ? await getSuggestedRoutesForBike(lang as 'it' | 'en' | 'de', routeCategory.name)
    : []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: translation?.name ?? id,
    description: translation?.description,
    url: `${siteUrl}/${lang}/bikes/${id}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    category: category.name,
    additionalProperty: [
      ...(model.batteryRange ? [{ '@type': 'PropertyValue', name: 'Battery range', value: model.batteryRange }] : []),
      ...(model.motor ? [{ '@type': 'PropertyValue', name: 'Motor', value: model.motor }] : []),
      ...(model.gearCount ? [{ '@type': 'PropertyValue', name: 'Gears', value: model.gearCount }] : []),
    ],
    offers: {
      '@type': 'Offer',
      price: priceForDay(category, 1) ?? 0,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    brand: { '@type': 'Brand', name: 'Lelettrica di Leoni Gabriele' },
  }

  const priceDays = Array.from({ length: category.maxRentalDays }, (_, i) => i + 1)
    .map((day) => ({ day, price: priceForDay(category, day) }))
    .filter((p): p is { day: number; price: number } => p.price !== null)

  return (
    <>
      <FlagsExplorer flags={flags} />
      <BikeViewTracker bikeModelId={model.id} category={category.name} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
      <main className="w-full pt-24 pb-8">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <Link href={`/${lang}/bikes`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#366DA1]">
            <ArrowLeft size={16} /> {d.back_to_list}
          </Link>

          <MediaGallery media={allMedia} title={translation?.name ?? id} fit="contain" />

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{category.name}</Badge>
              {routeCategory && <Badge variant="outline">{routeCategory.name}</Badge>}
            </div>
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{translation?.name ?? id}</h1>
            <p className="text-muted-foreground max-w-2xl">{translation?.description}</p>
          </div>

          {(model.batteryRange || model.motor || model.gearCount) && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#1e3a5f]">{d.specs_title}</h2>
              <div className="flex flex-wrap gap-2">
                {model.batteryRange && <Badge variant="outline">{d.spec_battery_range}: {model.batteryRange}</Badge>}
                {model.motor && <Badge variant="outline">{d.spec_motor}: {model.motor}</Badge>}
                {model.gearCount && <Badge variant="outline">{d.spec_gear_count}: {model.gearCount}</Badge>}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.sizes_available_title}</h2>
            <div className="flex flex-wrap gap-2">
              {sizesInGarage.map((size) => <Badge key={size.id} variant="outline">{size.name}</Badge>)}
            </div>
          </div>

          {versionsInGarage.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-[#1e3a5f]">{d.versions_available_title}</h2>
              <div className="flex flex-wrap gap-2">
                {versionsInGarage.map((version) => <Badge key={version.id} variant="outline">{version.name}</Badge>)}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.pricing_title}</h2>
            <div className="rounded-lg border divide-y">
              {priceDays.map(({ day, price }) => (
                <div key={day} className="flex justify-between px-4 py-2 text-sm">
                  <span>{d.price_day.replace('{day}', String(day))}</span>
                  <span className="font-bold text-[#1e3a5f]">€{price}</span>
                </div>
              ))}
              {category.afternoonPrice !== null && (
                <div className="flex justify-between px-4 py-2 text-sm">
                  <span>{d.price_afternoon}</span>
                  <span className="font-bold text-[#1e3a5f]">€{Number(category.afternoonPrice)}</span>
                </div>
              )}
            </div>
          </div>

          <BikeSuggestedRoutes routes={suggestedRoutes} lang={lang} dict={dict} title={d.suggested_routes_title} />

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[#1e3a5f]">{d.contact_button}</h2>
            <BikeContactButtons dict={dict} />
          </div>
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
