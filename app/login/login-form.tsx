'use client'
import { useState } from 'react'
import { loginAction, magicLinkAction, resetPasswordAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'password' | 'magic' | 'reset'

const INFO_MESSAGES: Record<string, string> = {
  magic_link_sent: 'Controlla la tua email: ti abbiamo inviato un link di accesso.',
  reset_sent: 'Controlla la tua email: ti abbiamo inviato il link per reimpostare la password.',
}

interface Props {
  error?: string
  info?: string
}

export function LoginForm({ error, info }: Props) {
  const [mode, setMode] = useState<Mode>('password')

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}
      {info && INFO_MESSAGES[info] && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
          {INFO_MESSAGES[info]}
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
        {([
          { id: 'password', label: 'Password' },
          { id: 'magic',    label: 'Magic link' },
          { id: 'reset',    label: 'Reset' },
        ] as { id: Mode; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 py-2.5 transition-colors cursor-pointer ${
              mode === id
                ? 'bg-[#1e3a5f] text-white font-semibold'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' && (
        <form action={loginAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="nome@esempio.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
            Accedi
          </Button>
        </form>
      )}

      {mode === 'magic' && (
        <form action={magicLinkAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" required autoComplete="email" placeholder="nome@esempio.com" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Riceverai un link monouso via email. Nessuna password richiesta.
          </p>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
            Invia magic link
          </Button>
        </form>
      )}

      {mode === 'reset' && (
        <form action={resetPasswordAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" name="email" type="email" required autoComplete="email" placeholder="nome@esempio.com" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Riceverai un link per impostare una nuova password.
          </p>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
            Invia link di reset
          </Button>
        </form>
      )}
    </div>
  )
}
