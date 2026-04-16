import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'

interface PricingDict {
  pricing: {
    title: string
    subtitle: string
    download_pdf: string
    ebike_title: string
    classic_title: string
    segway_title: string
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
    hour_1: string
    hours_2: string
    hours_3: string
    hours_4: string
    full_day: string
    per_day: string
    from_day2: string
    not_available: string
    charger: string
    child_seat: string
    one_time: string
  }
}

export function PricingSection({ dict }: { dict: PricingDict }) {
  const p = dict.pricing

  return (
    <section id="prezzi" className="py-20 bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {p.title}
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">{p.subtitle}</p>
        </div>

        {/* E-Bike table */}
        <div className="mb-10">
          <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="text-2xl">⚡</span> {p.ebike_title}
          </h3>
          <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-foreground">{p.duration}</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">eMTB FRONT<br /><span className="font-normal text-xs text-muted-foreground">Flyer Uproc 2</span></TableHead>
                  <TableHead className="font-semibold text-foreground text-center">CITY eBike<br /><span className="font-normal text-xs text-muted-foreground">Flyer Gotour 6</span></TableHead>
                  <TableHead className="font-semibold text-foreground text-center">eMTB FULL<br /><span className="font-normal text-xs text-muted-foreground">Flyer Uproc X</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: p.half_day, uproc2: '€25', gotour: '€20', uprocx: p.not_available },
                  { label: p.day_1,    uproc2: '€35', gotour: '€30', uprocx: '€70' },
                  { label: p.days_2,   uproc2: '€65', gotour: '€55', uprocx: '€120' },
                  { label: p.days_3,   uproc2: '€90', gotour: '€80', uprocx: '€165' },
                  { label: p.days_4,   uproc2: '€110', gotour: '€100', uprocx: '€200' },
                  { label: p.days_5,   uproc2: '€125', gotour: '€115', uprocx: '€225' },
                  { label: p.days_6,   uproc2: '€140', gotour: '€130', uprocx: p.not_available },
                  { label: p.days_7,   uproc2: '€170', gotour: '€150', uprocx: p.not_available },
                ].map((row) => (
                  <TableRow key={row.label} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-center text-primary font-semibold">{row.uproc2}</TableCell>
                    <TableCell className="text-center text-primary font-semibold">{row.gotour}</TableCell>
                    <TableCell className="text-center text-primary font-semibold">{row.uprocx}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Classic + Segway side by side */}
        <div className="grid sm:grid-cols-2 gap-8 mb-10">
          {/* Bici classica */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="text-2xl">🚲</span> {p.classic_title}
            </h3>
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-foreground">{p.duration}</TableHead>
                    <TableHead className="font-semibold text-foreground text-center"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-slate-50/60">
                    <TableCell className="font-medium">{p.day_1}</TableCell>
                    <TableCell className="text-center text-primary font-semibold">€15</TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-slate-50/60">
                    <TableCell className="font-medium">{p.from_day2}</TableCell>
                    <TableCell className="text-center text-primary font-semibold">€10 {p.per_day}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Segway */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <span className="text-2xl">🛴</span> {p.segway_title}
            </h3>
            <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-foreground">{p.duration}</TableHead>
                    <TableHead className="font-semibold text-foreground text-center"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: p.hour_1, price: '€10' },
                    { label: p.hours_2, price: '€15' },
                    { label: p.hours_3, price: '€18' },
                    { label: p.hours_4, price: '€20' },
                    { label: p.full_day, price: '€25' },
                  ].map((row) => (
                    <TableRow key={row.label} className="hover:bg-slate-50/60">
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-center text-primary font-semibold">{row.price}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Extra */}
        <div className="mb-10">
          <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="text-2xl">🔌</span> {p.extras_title}
          </h3>
          <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm max-w-sm">
            <Table>
              <TableBody>
                <TableRow className="hover:bg-slate-50/60">
                  <TableCell className="font-medium">{p.charger}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">€5 <span className="text-xs font-normal text-muted-foreground">({p.one_time})</span></TableCell>
                </TableRow>
                <TableRow className="hover:bg-slate-50/60">
                  <TableCell className="font-medium">{p.child_seat}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">€3 <span className="text-xs font-normal text-muted-foreground">({p.one_time})</span></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator className="my-8" />

        {/* PDF Download */}
        <div className="text-center">
          <Button asChild variant="outline" size="lg" className="gap-2">
            <a href="/Volantino 2023.pdf" target="_blank" rel="noopener noreferrer">
              <Download size={18} />
              {p.download_pdf}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
