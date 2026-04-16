import { notFound } from 'next/navigation'
import { getDictionary, hasLocale } from './dictionaries'
import { Navbar } from '@/components/navbar'
import { HeroSection } from '@/components/hero-section'
import { ServicesSection } from '@/components/services-section'
import { PricingSection } from '@/components/pricing-section'
import { MapSection } from '@/components/map-section'
import { Footer } from '@/components/footer'

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <main>
        <HeroSection lang={lang} dict={dict} />
        <ServicesSection dict={dict} />
        <PricingSection dict={dict} />
        <MapSection dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
