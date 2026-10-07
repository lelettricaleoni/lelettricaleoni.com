'use client'
import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { googleLoginAction, loginAction, registerAction, resetPasswordAction } from '@/lib/actions/auth'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** `password` is signing in; `register` creates the account; `reset` is the way out of a forgotten password. */
export type LoginTab = 'password' | 'reset' | 'register'

interface Dict {
  title: string
  subtitle: string
  title_register: string
  title_reset: string
  tab_signin: string
  tab_register: string
  or_email: string
  email_placeholder: string
  password_placeholder: string
  forgot_password: string
  back_to_signin: string
  reset_hint: string
  register_hint: string
  first_name_label: string
  last_name_label: string
  password_new_hint: string
  consent_label: string
  privacy_link: string
  submit_password: string
  submit_reset: string
  submit_register: string
  google_button: string
}

interface Props {
  lang: string
  d: Dict
  errorMessage: string | null
  infoMessage: string | null
  initialTab: LoginTab
  /** A path of this site to go back to after signing in, or empty. */
  next: string
}

const submitClass = 'w-full'
const linkClass = 'text-xs text-primary hover:underline cursor-pointer'

/**
 * The one sign-in page, for customers and admins alike, and for signing up: one card with Google on top and
 * the email form below, which switches between signing in and creating the account in place. A forgotten
 * password is a small view of the same card, reached by a link.
 *
 * Every form sends the language, so the answer comes back in it, and `next`, so a person stopped on the way
 * to somewhere goes back there. What went wrong arrives as a message already in the page's language (the
 * address carries a code).
 */
export function LoginForm({ lang, d, errorMessage, infoMessage, initialTab, next }: Props) {
  const [mode, setMode] = useState<LoginTab>(initialTab)

  const go = (to: LoginTab) => {
    setMode(to)
    trackEvent('login_mode_switch', { mode: to })
  }

  const hidden = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next} />
    </>
  )

  const heading = {
    password: { title: d.title, subtitle: d.subtitle },
    register: { title: d.title_register, subtitle: d.register_hint },
    reset: { title: d.title_reset, subtitle: d.reset_hint },
  }[mode]
  const main = mode === 'password' || mode === 'register'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{heading.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{heading.subtitle}</p>
      </div>

      {errorMessage && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{errorMessage}</div>
      )}
      {infoMessage && (
        <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">{infoMessage}</div>
      )}

      {main && (
        <>
          <form action={googleLoginAction}>
            {hidden}
            <Button type="submit" variant="outline" className="w-full gap-2.5">
              <FcGoogle className="size-5" aria-hidden />
              {d.google_button}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />{d.or_email}<span className="h-px flex-1 bg-border" />
          </div>

          <div role="tablist" className="grid grid-cols-2 rounded-lg border overflow-hidden text-sm font-medium">
            {([
              { id: 'password', label: d.tab_signin },
              { id: 'register', label: d.tab_register },
            ] as { id: LoginTab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => go(id)}
                className={`py-2.5 transition-colors cursor-pointer ${
                  mode === id ? 'bg-primary text-primary-foreground font-semibold' : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === 'password' && (
        <form action={loginAction} className="space-y-4">
          {hidden}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button type="button" onClick={() => go('reset')} className={linkClass}>{d.forgot_password}</button>
            </div>
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder={d.password_placeholder} />
          </div>
          <Button type="submit" className={submitClass}>{d.submit_password}</Button>
        </form>
      )}

      {mode === 'register' && (
        <form action={registerAction} className="space-y-4">
          {hidden}
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
            <Label htmlFor="register-password">Password</Label>
            <Input id="register-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder={d.password_placeholder} />
            <p className="text-xs text-muted-foreground">{d.password_new_hint}</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed cursor-pointer">
            <input type="checkbox" name="consent" required className="mt-0.5" />
            <span>
              {d.consent_label}{' '}
              <a href={`/${lang}/privacy`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{d.privacy_link}</a>.
            </span>
          </label>
          <Button type="submit" className={submitClass}>{d.submit_register}</Button>
        </form>
      )}

      {mode === 'reset' && (
        <form action={resetPasswordAction} className="space-y-4">
          {hidden}
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" name="email" type="email" required autoComplete="email" placeholder={d.email_placeholder} />
          </div>
          <Button type="submit" className={submitClass}>{d.submit_reset}</Button>
          <p className="text-center">
            <button type="button" onClick={() => go('password')} className={linkClass}>{d.back_to_signin}</button>
          </p>
        </form>
      )}
    </div>
  )
}
