'use client'
import { useState } from 'react'
import { googleLoginAction, loginAction, magicLinkAction, registerAction, resetPasswordAction } from '@/lib/actions/auth'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type LoginTab = 'password' | 'magic' | 'reset' | 'register'

interface Dict {
  tab_password: string
  tab_magic: string
  tab_reset: string
  tab_register: string
  email_placeholder: string
  password_placeholder: string
  magic_hint: string
  reset_hint: string
  register_hint: string
  first_name_label: string
  last_name_label: string
  phone_label: string
  phone_hint: string
  password_new_hint: string
  consent_label: string
  privacy_link: string
  submit_password: string
  submit_magic: string
  submit_reset: string
  submit_register: string
  google_button: string
  or: string
}

interface Props {
  lang: string
  d: Dict
  errorMessage: string | null
  infoMessage: string | null
  initialTab: LoginTab
  /** A path of this site to go back to after signing in, or empty. */
  next: string
  googleEnabled: boolean
}

const submitClass = 'w-full bg-[#1e3a5f] hover:bg-[#152c4a]'

/**
 * The one sign-in form, for customers and admins alike. Every form sends the language, so the answer
 * comes back in it, and `next`, so a person stopped on the way to somewhere goes back there.
 * What went wrong arrives as a message already in the page's language (the address carries a code).
 */
export function LoginForm({ lang, d, errorMessage, infoMessage, initialTab, next, googleEnabled }: Props) {
  const [mode, setMode] = useState<LoginTab>(initialTab)

  const hidden = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next} />
    </>
  )

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{errorMessage}</div>
      )}
      {infoMessage && (
        <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{infoMessage}</div>
      )}

      <div className="grid grid-cols-4 rounded-lg border overflow-hidden text-xs font-medium">
        {([
          { id: 'password', label: d.tab_password },
          { id: 'magic',    label: d.tab_magic },
          { id: 'reset',    label: d.tab_reset },
          { id: 'register', label: d.tab_register },
        ] as { id: LoginTab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setMode(id); trackEvent('login_mode_switch', { mode: id }) }}
            className={`py-2.5 px-1 transition-colors cursor-pointer ${
              mode === id ? 'bg-[#1e3a5f] text-white font-semibold' : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' && (
        <form action={loginAction} className="space-y-4">
          {hidden}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder={d.password_placeholder} />
          </div>
          <Button type="submit" className={submitClass}>{d.submit_password}</Button>
        </form>
      )}

      {mode === 'magic' && (
        <form action={magicLinkAction} className="space-y-4">
          {hidden}
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{d.magic_hint}</p>
          <Button type="submit" className={submitClass}>{d.submit_magic}</Button>
        </form>
      )}

      {mode === 'reset' && (
        <form action={resetPasswordAction} className="space-y-4">
          {hidden}
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{d.reset_hint}</p>
          <Button type="submit" className={submitClass}>{d.submit_reset}</Button>
        </form>
      )}

      {mode === 'register' && (
        <form action={registerAction} className="space-y-4">
          {hidden}
          <p className="text-xs text-muted-foreground leading-relaxed">{d.register_hint}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">{d.first_name_label}</Label>
              <Input id="first_name" name="first_name" required maxLength={80} autoComplete="given-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">{d.last_name_label}</Label>
              <Input id="last_name" name="last_name" required maxLength={80} autoComplete="family-name" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-email">Email</Label>
            <Input id="register-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-phone">{d.phone_label}</Label>
            <Input id="register-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" placeholder="+39 333 1234567" />
            <p className="text-xs text-muted-foreground">{d.phone_hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-password">Password</Label>
            <Input id="register-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder={d.password_placeholder} />
            <p className="text-xs text-muted-foreground">{d.password_new_hint}</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed cursor-pointer">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>
              {d.consent_label}{' '}
              <a href={`/${lang}/privacy`} target="_blank" rel="noopener noreferrer" className="text-[#366DA1] underline">{d.privacy_link}</a>.
            </span>
          </label>
          <Button type="submit" className={submitClass}>{d.submit_register}</Button>
        </form>
      )}

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />{d.or}<span className="h-px flex-1 bg-border" />
          </div>
          <form action={googleLoginAction}>
            {hidden}
            <Button type="submit" variant="outline" className="w-full">{d.google_button}</Button>
          </form>
        </>
      )}
    </div>
  )
}
