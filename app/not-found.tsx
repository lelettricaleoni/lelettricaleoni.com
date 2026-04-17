import Link from 'next/link'
import Image from 'next/image'
import { MapPin, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata = { title: '404 - Pagina non trovata | Lelettrica' }

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      {/* Logo */}
      <Link href="/it" className="mb-12 opacity-80 hover:opacity-100 transition-opacity">
        <Image
          src="/svg/LogoLelettrica_full.svg"
          alt="Lelettrica"
          width={320}
          height={100}
          className="h-20 sm:h-28 w-auto"
        />
      </Link>

      {/* 404 number */}
      <p className="text-[9rem] sm:text-[12rem] font-black leading-none text-primary/10 select-none tabular-nums">
        404
      </p>

      {/* Message */}
      <div className="-mt-4 space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Pagina non trovata
        </h1>
        <p className="text-muted-foreground max-w-sm mx-auto">
          La pagina che cerchi non esiste o è stata spostata.
          Torna alla home per trovare tutte le informazioni sul noleggio e-bike.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center">
        <Button asChild size="lg" className="gap-2">
          <Link href="/it">
            <ArrowLeft size={18} />
            Torna alla home
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <a href="tel:+393381232434">
            <MapPin size={18} />
            Chiamaci
          </a>
        </Button>
      </div>

      {/* Address hint */}
      <p className="mt-12 text-xs text-muted-foreground/60">
        Via Roma 90, Dro (TN) · +39 338 123 2434
      </p>
    </div>
  )
}
