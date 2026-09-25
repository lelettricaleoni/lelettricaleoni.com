import Link from 'next/link'
import { Zap, Bike, Mountain } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionViewTracker } from './section-view-tracker'

interface BikesTeaserSectionProps {
  lang: string
  dict: {
    bikes_teaser: {
      title: string
      copy: string
      cta: string
    }
    // The four families of the price list, by the names the price list uses:
    // nothing new to translate, and the two sections can never disagree.
    pricing: {
      emtb_title: string
      gravel_city_title: string
      classic_bike_title: string
      classic_mtb_title: string
    }
  }
}

/**
 * The invitation to the bikes section, and the first place the logo's violet
 * is used: the site speaks blue for the trails and actions, violet for the
 * bikes. The tint behind it (a whisper of the same violet) is also what keeps
 * it apart from the white services section above and the slate price list
 * below, without the full-bleed colour band it used to be.
 *
 * The right-hand side is an index of the fleet, not a picture of a bike: the
 * four families the shop rents, from the price list, each with the price
 * list's own icon. Hairlines between the cells, no boxes or shadows.
 */
export function BikesTeaserSection({ lang, dict }: BikesTeaserSectionProps) {
  const d = dict.bikes_teaser
  const p = dict.pricing

  // The same icons the price list gives these four families, so the two
  // sections read as one.
  const families: { icon: LucideIcon; label: string }[] = [
    { icon: Zap, label: p.emtb_title },
    { icon: Zap, label: p.gravel_city_title },
    { icon: Bike, label: p.classic_bike_title },
    { icon: Mountain, label: p.classic_mtb_title },
  ]

  return (
    <section id="bikes-teaser" className="bg-brand-purple-soft py-20 sm:py-28">
      <SectionViewTracker name="bikes_teaser" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid gap-10 md:grid-cols-2 md:gap-16 md:items-center">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{d.title}</h2>
          <p className="text-muted-foreground max-w-md mb-8">{d.copy}</p>
          <Button asChild size="lg" className="bg-brand-purple text-white hover:bg-brand-purple/90 font-semibold px-8">
            <Link href={`/${lang}/bikes`}>{d.cta}</Link>
          </Button>
        </div>

        <ul className="grid grid-cols-2 border-y border-brand-purple/20 [&>li:nth-child(odd)]:border-r [&>li:nth-child(odd)]:border-brand-purple/20 [&>li:nth-child(n+3)]:border-t [&>li:nth-child(n+3)]:border-brand-purple/20">
          {families.map(({ icon: Icon, label }) => (
            <li key={label} className="flex flex-col items-start gap-3 px-5 py-6">
              <Icon size={26} strokeWidth={1.75} className="text-brand-purple" aria-hidden />
              <span className="font-semibold text-foreground leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
