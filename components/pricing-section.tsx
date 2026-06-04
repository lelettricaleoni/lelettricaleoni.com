'use client'

import { Download, Zap, Bike, Tag, Mountain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { trackEvent } from '@/lib/analytics'
import { SectionViewTracker } from '@/components/section-view-tracker'

interface PricingDict {
  pricing: {
    title: string
    subtitle: string
    download_pdf: string
    gravel_city_title: string
    emtb_title: string
    classic_bike_title: string
    classic_mtb_title: string
    extras_title: string
    duration: string
    afternoon: string
    day_1: string
    days_2: string
    days_3: string
    days_4: string
    days_5: string
    days_6: string
    days_7: string
    per_day: string
    from_day2: string
    not_available: string
    charger: string
    child_seat: string
    range_extender: string
    range_extender_note: string
    one_time: string
  }
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{label}</h3>
    </div>
  )
}

function PriceRow({ label, price, sub }: { label: string; price: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border/40 last:border-0">
      <span className="text-sm text-foreground/80">{label}</span>
      <span className="font-semibold text-primary text-sm">
        {price}
        {sub && <span className="ml-1 text-xs font-normal text-muted-foreground">{sub}</span>}
      </span>
    </div>
  )
}

function PriceCell({ value }: { value: string | null }) {
  if (!value) {
    return (
      <TableCell className="text-center text-muted-foreground/30 select-none text-base">•</TableCell>
    )
  }
  return (
    <TableCell className="text-center text-primary font-semibold text-sm">{value}</TableCell>
  )
}

export function PricingSection({ dict }: { dict: PricingDict }) {
  const p = dict.pricing

  return (
    <section id="prezzi" className="py-20 bg-slate-50">
      <SectionViewTracker name="pricing" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{p.title}</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{p.subtitle}</p>
        </div>

        {/* Gravel & City eBike */}
        <div className="mb-10">
          <SectionTitle icon={<Zap size={18} />} label={p.gravel_city_title} />
          <div className="rounded-xl border border-border bg-white overflow-x-auto shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-foreground w-40">{p.duration}</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Gravel</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">City eBike</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: p.day_1,     gravel: '€25',   city: '€33'   },
                  { label: p.days_2,    gravel: '€47',   city: '€60'   },
                  { label: p.days_3,    gravel: '€68',   city: '€88'   },
                  { label: p.days_4,    gravel: '€88',   city: '€110'  },
                  { label: p.days_5,    gravel: '€105',  city: '€127'  },
                  { label: p.days_6,    gravel: '€120',  city: '€143'  },
                  { label: p.days_7,    gravel: '€135',  city: '€165'  },
                  { label: p.afternoon, gravel: '€20',   city: '€22'   },
                ].map((row) => (
                  <TableRow key={row.label} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell className="text-center text-primary font-semibold text-sm">{row.gravel}</TableCell>
                    <TableCell className="text-center text-primary font-semibold text-sm">{row.city}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* eMTB */}
        <div className="mb-10">
          <SectionTitle icon={<Zap size={18} />} label={p.emtb_title} />
          <div className="rounded-xl border border-border bg-white overflow-x-auto shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-foreground w-40">{p.duration}</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">eMTB Front</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">eMTB Full — Alu</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">eMTB Full — Carbon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: p.day_1,     front: '€38',   alu: '€60',   carbon: '€70'   },
                  { label: p.days_2,    front: '€72',   alu: '€115',  carbon: '€125'  },
                  { label: p.days_3,    front: '€100',  alu: '€160',  carbon: '€180'  },
                  { label: p.days_4,    front: '€120',  alu: '€195',  carbon: '€220'  },
                  { label: p.days_5,    front: '€138',  alu: '€125',  carbon: '€250'  },
                  { label: p.days_6,    front: '€154',  alu: null,    carbon: null     },
                  { label: p.days_7,    front: '€180',  alu: null,    carbon: null     },
                  { label: p.afternoon, front: '€27',   alu: null,    carbon: null     },
                ].map((row) => (
                  <TableRow key={row.label} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell className="text-center text-primary font-semibold text-sm">{row.front}</TableCell>
                    <PriceCell value={row.alu} />
                    <PriceCell value={row.carbon} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Bici classiche */}
        <div className="grid sm:grid-cols-2 gap-6 mb-6">
          <div>
            <SectionTitle icon={<Bike size={18} />} label={p.classic_bike_title} />
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <PriceRow label={p.day_1}     price="€15" />
              <PriceRow label={p.from_day2} price={`€10 ${p.per_day}`} />
            </div>
          </div>

          <div>
            <SectionTitle icon={<Mountain size={18} />} label={p.classic_mtb_title} />
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <PriceRow label={p.day_1}     price="€20" />
              <PriceRow label={p.from_day2} price={`€15 ${p.per_day}`} />
            </div>
          </div>
        </div>

        {/* Extra */}
        <div className="mb-10">
          <SectionTitle icon={<Tag size={18} />} label={p.extras_title} />
          <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
            <PriceRow label={p.charger}        price="€5"  sub={`(${p.one_time})`} />
            <PriceRow label={p.child_seat}     price="€3"  sub={`(${p.one_time})`} />
            <PriceRow label={p.range_extender} price="€15" sub={`• ${p.range_extender_note}`} />
          </div>
        </div>

        <div className="border-t border-border/50 my-8" />

        <div className="text-center">
          <Button asChild variant="outline" size="lg" className="gap-2">
            <a
              href="/pdf/Volantino 2026.pdf"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('file_download', { file_name: 'listino-prezzi-2026', file_extension: 'pdf' })}
            >
              <Download size={18} />
              {p.download_pdf}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
