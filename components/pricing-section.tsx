'use client'

import { Download, Zap, Bike, Tag } from 'lucide-react'
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
    ebike_title: string
    classic_title: string
    extras_title: string
    duration: string
    half_day: string
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

        {/* E-Bike — tabella full-width 4 colonne */}
        <div className="mb-10">
          <SectionTitle icon={<Zap size={18} />} label={p.ebike_title} />
          <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-foreground w-32">{p.duration}</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">
                    eMTB Front
                    <span className="block font-normal text-xs text-muted-foreground">Flyer Uproc 2</span>
                  </TableHead>
                  <TableHead className="font-semibold text-foreground text-center">
                    City eBike
                    <span className="block font-normal text-xs text-muted-foreground">Flyer Gotour 6</span>
                  </TableHead>
                  <TableHead className="font-semibold text-foreground text-center">
                    eMTB Full
                    <span className="block font-normal text-xs text-muted-foreground">Flyer Uproc X</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: p.half_day, uproc2: '€25',  gotour: '€20',  uprocx: null },
                  { label: p.day_1,    uproc2: '€35',  gotour: '€30',  uprocx: '€70' },
                  { label: p.days_2,   uproc2: '€65',  gotour: '€55',  uprocx: '€120' },
                  { label: p.days_3,   uproc2: '€90',  gotour: '€80',  uprocx: '€165' },
                  { label: p.days_4,   uproc2: '€110', gotour: '€100', uprocx: '€200' },
                  { label: p.days_5,   uproc2: '€125', gotour: '€115', uprocx: '€225' },
                  { label: p.days_6,   uproc2: '€140', gotour: '€130', uprocx: null },
                  { label: p.days_7,   uproc2: '€170', gotour: '€150', uprocx: null },
                ].map((row) => (
                  <TableRow key={row.label} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell className="text-center text-primary font-semibold text-sm">{row.uproc2}</TableCell>
                    <TableCell className="text-center text-primary font-semibold text-sm">{row.gotour}</TableCell>
                    <TableCell className="text-center text-sm">
                      {row.uprocx
                        ? <span className="text-primary font-semibold">{row.uprocx}</span>
                        : <span className="text-muted-foreground/50 select-none">—</span>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Bici classica + Extra affiancati */}
        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          <div>
            <SectionTitle icon={<Bike size={18} />} label={p.classic_title} />
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <PriceRow label={p.day_1}    price="€15" />
              <PriceRow label={p.from_day2} price={`€10 ${p.per_day}`} />
            </div>
          </div>

          <div>
            <SectionTitle icon={<Tag size={18} />} label={p.extras_title} />
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <PriceRow label={p.charger}    price="€5" sub={`(${p.one_time})`} />
              <PriceRow label={p.child_seat} price="€3" sub={`(${p.one_time})`} />
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 my-8" />

        <div className="text-center">
          <Button asChild variant="outline" size="lg" className="gap-2">
            <a
              href="/pdf/Volantino 2023.pdf"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('file_download', { file_name: 'listino-prezzi', file_extension: 'pdf' })}
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
