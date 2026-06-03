'use client'
import { useState } from 'react'
import { loginAction, magicLinkAction, resetPasswordAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'password' | 'magic' | 'reset'

interface Dict {
  title: string
  subtitle: string
  tab_password: string
  tab_magic: string
  tab_reset: string
  email_placeholder: string
  password_placeholder: string
  magic_hint: string
  reset_hint: string
  submit_password: string
  submit_magic: string
  submit_reset: string
  magic_sent: string
  reset_sent: string
}

interface Props {
  lang: string
  d: Dict
  error?: string
  info?: string
}

export function LoginForm({ lang, d, error, info }: Props) {
  const [mode, setMode] = useState<Mode>('password')

  const infoMessage = info === 'magic_link_sent' ? d.magic_sent
    : info === 'reset_sent' ? d.reset_sent
    : null

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{error}</div>
      )}
      {infoMessage && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{infoMessage}</div>
      )}

      <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
        {([
          { id: 'password', label: d.tab_password },
          { id: 'magic',    label: d.tab_magic },
          { id: 'reset',    label: d.tab_reset },
        ] as { id: Mode; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 py-2.5 transition-colors cursor-pointer ${
              mode === id ? 'bg-[#1e3a5f] text-white font-semibold' : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' && (
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder={d.password_placeholder} />
          </div>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">{d.submit_password}</Button>
        </form>
      )}

      {mode === 'magic' && (
        <form action={magicLinkAction} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{d.magic_hint}</p>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">{d.submit_magic}</Button>
        </form>
      )}

      {mode === 'reset' && (
        <form action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{d.reset_hint}</p>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">{d.submit_reset}</Button>
        </form>
      )}
    </div>
  )
}
