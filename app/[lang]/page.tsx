import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getDictionary, hasLocale } from './dictionaries'
import { Navbar } from '@/components/navbar'
import { HeroSection } from '@/components/hero-section'
import { RoutesTeaserSection } from '@/components/routes-teaser-section'
import { BikesTeaserSection } from '@/components/bikes-teaser-section'
import { SectionStack } from '@/components/section-stack'
import { ServicesSection } from '@/components/services-section'
import { PricingSection } from '@/components/pricing-section'
import { MapSection } from '@/components/map-section'
import { Footer } from '@/components/footer'
import { HomeCatalogJsonLd } from '@/components/home-catalog-jsonld-script'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
//
// This page reads its data through "use cache" functions; there is nothing left here for Cache Components to win
// by prerendering the shell, so it stays request-bound, exactly as it always was.
export const instant = false;

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  // Rendered on every request, not prerendered at build: the build has no database. What these pages read is
  // cached by the "use cache" functions behind them (profile `catalog`), so a request stays cheap.
  await connection()
  const dict = await getDictionary(lang)

  return (
    <>
      <Suspense fallback={null}>
        <HomeCatalogJsonLd lang={lang} siteUrl={siteUrl} name={dict.bikes.page_title} />
      </Suspense>
      <Navbar lang={lang} dict={dict} />
      <main>
        <HeroSection lang={lang} dict={dict} />
        {/* The stack alternates the backgrounds, so no section sets its own. */}
        <SectionStack>
          <RoutesTeaserSection lang={lang} dict={dict} />
          <ServicesSection dict={dict} />
          <BikesTeaserSection lang={lang} dict={dict} />
          <PricingSection dict={dict} />
          <MapSection dict={dict} />
        </SectionStack>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
