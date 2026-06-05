'use client'
import Image from 'next/image'
import { useParams, useSearchParams } from 'next/navigation'
import { updatePasswordAction } from '@/lib/actions/auth'
import { Navbar } from '@/components/navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const DICT = {
  it: { title: 'Nuova password', subtitle: 'Scegli una password di almeno 8 caratteri', label: 'Nuova password', submit: 'Salva password', gdpr: 'Accesso riservato. Dati trattati nel rispetto del GDPR.', left_title: 'Noleggio e-bike a Dro,\nLago di Garda' },
  en: { title: 'New password', subtitle: 'Choose a password of at least 8 characters', label: 'New password', submit: 'Save password', gdpr: 'Restricted access. Data processed in accordance with GDPR.', left_title: 'E-bike rental in Dro,\nLake Garda' },
  de: { title: 'Neues Passwort', subtitle: 'Wähle ein Passwort mit mindestens 8 Zeichen', label: 'Neues Passwort', submit: 'Passwort speichern', gdpr: 'Eingeschränkter Zugang. Daten werden gemäß DSGVO verarbeitet.', left_title: 'E-Bike-Verleih in Dro,\nGardasee' },
}

const NAV_DICT = {
  it: { nav: { services: 'Servizi', pricing: 'Prezzi', contact: 'Contatti' } },
  en: { nav: { services: 'Services', pricing: 'Pricing', contact: 'Contact' } },
  de: { nav: { services: 'Leistungen', pricing: 'Preise', contact: 'Kontakt' } },
}

export default function UpdatePasswordPage() {
  const { lang } = useParams<{ lang: string }>()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const d = DICT[lang as keyof typeof DICT] ?? DICT.it
  const navDict = NAV_DICT[lang as keyof typeof NAV_DICT] ?? NAV_DICT.it

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang ?? 'it'} dict={navDict} />

      <div className="flex flex-1 pt-16">
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <Image src="/images/about.webp" alt="" fill className="object-cover" priority />
          <div className="absolute bottom-12 left-12 right-12 z-10 space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight drop-shadow-lg whitespace-pre-line">
              {d.left_title}
            </h2>
            <p className="text-white/80 text-sm drop-shadow">{d.gdpr}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">{d.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{d.subtitle}</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{error}</div>
            )}

            <form action={updatePasswordAction} className="space-y-4">
              <input type="hidden" name="lang" value={lang ?? 'it'} />
              <div className="space-y-1.5">
                <Label htmlFor="password">{d.label}</Label>
                <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">{d.submit}</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
