import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Phone, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface HeroSectionProps {
  lang: string
  dict: {
    hero: {
      open_badge: string
      coming_soon_label: string
      headline: string
      subheadline: string
      cta_map: string
      cta_contact: string
      website_wip: string
    }
    info: {
      hours_value: string
    }
  }
}

export function HeroSection({ lang, dict }: HeroSectionProps) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden pt-16">
      {/* Mobile portrait */}
      <Image
        src="/images/hero-mobile.webp"
        alt=""
        fill
        className="object-cover object-center sm:hidden"
        priority
        quality={82}
        sizes="(max-width: 639px) 100vw, 0px"
      />
      {/* Desktop landscape */}
      <Image
        src="/images/hero.webp"
        alt="Lelettrica — E-Bike Noleggio"
        fill
        className="object-cover object-[center_0%] hidden sm:block"
        priority
        quality={80}
        sizes="100vw"
      />
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60 z-10" />

      <div className="relative z-20 max-w-3xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center gap-6">
        {/* Status badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Badge className="bg-green-500/20 text-green-200 border-green-400/40 text-sm px-4 py-1.5 font-semibold uppercase tracking-wider">
            ● {dict.hero.open_badge}
          </Badge>
          <Badge
            variant="outline"
            className="border-white/30 text-white/80 text-sm px-4 py-1.5"
          >
            {dict.hero.coming_soon_label}
          </Badge>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-tight">
          {dict.hero.headline}
        </h1>

        {/* Subheadline */}
        <p className="text-xl sm:text-2xl text-white/80 font-light max-w-xl">
          {dict.hero.subheadline}
        </p>

        {/* Quick info */}
        <div className="flex flex-col sm:flex-row items-center gap-4 text-white/70 text-sm mt-2">
          <span className="flex items-center gap-1.5">
            <MapPin size={15} className="text-white/60" />
            Via Roma 90, Dro (TN)
          </span>
          <span className="hidden sm:block text-white/30">·</span>
          <span className="flex items-center gap-1.5">
            <Phone size={15} className="text-white/60" />
            +39 338 123 2434
          </span>
          <span className="hidden sm:block text-white/30">·</span>
          <span className="flex items-center gap-1.5">
            <Clock size={15} className="text-white/60" />
            {dict.info.hours_value}
          </span>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 font-semibold px-8">
            <Link href={`/${lang}#contatti`}>{dict.hero.cta_map}</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10 bg-transparent px-8"
          >
            <a href="tel:+393381232434">{dict.hero.cta_contact}</a>
          </Button>
        </div>

        {/* WIP notice */}
        <p className="text-white/50 text-sm max-w-lg mt-2 italic">
          {dict.hero.website_wip}
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/40 z-20">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  )
}
