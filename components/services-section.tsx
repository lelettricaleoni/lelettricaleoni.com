import Link from 'next/link'
import { Bike, Wrench, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { servicePageSlug } from '@/lib/service-pages'
import type { Locale } from '@/app/[lang]/dictionaries'

interface ServicesSectionProps {
  lang: Locale
  dict: {
    services: {
      title: string
      learn_more: string
      more_types_label: string
      rental: { title: string; desc: string }
      repair: { title: string; desc: string }
    }
    service_pages: {
      emtb_rental: { short_label: string }
      gravel_rental: { short_label: string }
    }
  }
}

export function ServicesSection({ lang, dict }: ServicesSectionProps) {
  return (
    <section id="servizi" className="py-20">
      <SectionViewTracker name="services" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-foreground mb-12">
          {dict.services.title}
        </h2>
        <div className="grid sm:grid-cols-2 gap-8">
          <Link href={`/${lang}/${servicePageSlug('ebikeRental', lang)}`} className="block group">
            <Card className="h-full border-border/60 group-hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <Bike className="text-primary" size={24} />
                </div>
                <CardTitle className="text-xl text-foreground">
                  {dict.services.rental.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {dict.services.rental.desc}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-4">
                  {dict.services.learn_more}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/${lang}/${servicePageSlug('ebikeRepair', lang)}`} className="block group">
            <Card className="h-full border-border/60 group-hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <Wrench className="text-primary" size={24} />
                </div>
                <CardTitle className="text-xl text-foreground">
                  {dict.services.repair.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {dict.services.repair.desc}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-4">
                  {dict.services.learn_more}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-8 text-sm">
          <span className="text-muted-foreground">{dict.services.more_types_label}</span>
          <Link
            href={`/${lang}/${servicePageSlug('emtbRental', lang)}`}
            className="rounded-full border border-border px-3 py-1 text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {dict.service_pages.emtb_rental.short_label}
          </Link>
          <Link
            href={`/${lang}/${servicePageSlug('gravelRental', lang)}`}
            className="rounded-full border border-border px-3 py-1 text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {dict.service_pages.gravel_rental.short_label}
          </Link>
        </div>
      </div>
    </section>
  )
}
