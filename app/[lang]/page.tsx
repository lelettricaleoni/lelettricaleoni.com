import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getDictionary, hasLocale } from './dictionaries'
import { Navbar } from '@/components/navbar'
import { HeroSection } from '@/components/hero-section'
import { RoutesTeaserSection } from '@/components/routes-teaser-section'
import { BikesTeaserSection } from '@/components/bikes-teaser-section'
import { ServicesSection } from '@/components/services-section'
import { PricingSection } from '@/components/pricing-section'
import { MapSection } from '@/components/map-section'
import { Footer } from '@/components/footer'
import { FlagsExplorer } from '@/components/flags-explorer'
import { getFlags } from '@/lib/flags'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
//
// getFlags() can't move into a "use cache" function: @flags-sdk/vercel reads
// headers() internally (Vercel Toolbar override support), and Cache
// Components forbids any headers()/cookies() access inside a cache scope,
// even indirect. This page has no other data to cache, so there is nothing
// left here for Cache Components to win — it stays exactly as dynamic as
// it always was, same as `main`.
export const instant = false;

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  // Without this, the build's own prerender pass has no real request, so
  // headers() (read internally by the flags SDK) hangs and rejects, gets
  // caught by getFlags()'s fail-open handling, and the resulting "on" value
  // gets baked into the static shell forever — the kill switch would only
  // ever take effect on the next deploy. connection() forces genuine
  // per-request evaluation instead. Found live: toggling the routes flag
  // off on a deployed preview did nothing until this was added.
  await connection()
  const dict = await getDictionary(lang)
  const flags = await getFlags()

  return (
    <>
      <FlagsExplorer flags={flags} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} showBikes={flags.bikes} />
      <main>
        <HeroSection lang={lang} dict={dict} />
        {flags.routes && <RoutesTeaserSection lang={lang} dict={dict} />}
        <ServicesSection dict={dict} />
        {flags.bikes && <BikesTeaserSection lang={lang} dict={dict} />}
        <PricingSection dict={dict} />
        <MapSection dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
