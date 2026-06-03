'use client'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { updatePasswordAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function UpdatePasswordPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-[#1e3a5f] relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 right-8 w-48 h-48 rounded-full bg-[#366DA1]/40" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-3xl font-bold text-white leading-tight">Imposta una nuova<br />password sicura</h2>
          <p className="text-[#a8c4e0] text-base leading-relaxed max-w-xs">
            Scegli una password robusta per proteggere il pannello di amministrazione.
          </p>
        </div>
        <div className="relative z-10">
          <p className="text-[#a8c4e0] text-sm">Accesso riservato. Dati trattati nel rispetto del GDPR.</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center">
            <Image src="/svg/LogoLelettrica_full.svg" alt="Lelettrica" width={160} height={64} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">Nuova password</h1>
            <p className="text-sm text-muted-foreground mt-1">Scegli una password di almeno 8 caratteri</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{error}</div>
          )}

          <form action={updatePasswordAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nuova password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
              Salva password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
