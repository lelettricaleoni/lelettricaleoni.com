import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getDictionary, hasLocale, type Locale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { PricingSection } from '@/components/pricing-section'
import { buildSocialMetadata } from '@/lib/metadata'
import { findServiceKeyBySlug, servicePageDictKey, servicePageSlug } from '@/lib/service-pages'

// Same Cache Components opt-out as app/[lang]/privacy/page.tsx.
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
export const instant = false

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  if (!hasLocale(lang)) return {}
  const key = findServiceKeyBySlug(lang, slug)
  if (!key) return {}

  const dict = await getDictionary(lang)
  const content = dict.service_pages[servicePageDictKey(key)]
  const url = `${siteUrl}/${lang}/${slug}`

  return {
    title: content.h1,
    description: content.meta_description,
    ...buildSocialMetadata({ lang, title: content.h1, description: content.meta_description, url }),
    alternates: {
      canonical: url,
      languages: {
        it: `${siteUrl}/it/${servicePageSlug(key, 'it')}`,
        en: `${siteUrl}/en/${servicePageSlug(key, 'en')}`,
        de: `${siteUrl}/de/${servicePageSlug(key, 'de')}`,
        'x-default': `${siteUrl}/it/${servicePageSlug(key, 'it')}`,
      },
    },
  }
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!hasLocale(lang)) notFound()
  const key = findServiceKeyBySlug(lang as Locale, slug)
  if (!key) notFound()

  const dict = await getDictionary(lang)
  const sp = dict.service_pages
  const content = sp[servicePageDictKey(key)]

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <div className="min-h-screen bg-white pt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">{content.h1}</h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-8">{content.intro}</p>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Button asChild size="lg">
              <a href="tel:+393381232434">{dict.hero.cta_contact}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${lang}/bikes`}>{sp.cta_bikes}</Link>
            </Button>
          </div>
        </div>

        <PricingSection dict={dict} />
      </div>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
