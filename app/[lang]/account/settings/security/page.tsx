import { notFound } from 'next/navigation'
import { getDictionary, hasLocale } from '../../../dictionaries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Flash, PageTitle, Section } from '@/components/account/flash'
import { getCurrentUser } from '@/lib/auth/current-user'
import { changeEmailAction, signOutEverywhereAction } from '@/lib/actions/account'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

const ERROR_CODES = ['invalid_email', 'same_email', 'rate_limited', 'email_failed'] as const
type ErrorCode = (typeof ERROR_CODES)[number]
const INFO_CODES = ['email_change_sent', 'email_changed', 'password_updated'] as const
type InfoCode = (typeof INFO_CODES)[number]

/** How the person gets in (email, password, Google) and where they are signed in. */
export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string; info?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  // The layout has already sent somebody who is not signed in to the sign-in page.
  const user = (await getCurrentUser())!

  const { error, info } = await searchParams
  const d = (await getDictionary(lang)).account
  const errorMessage = (ERROR_CODES as readonly string[]).includes(error ?? '') ? d.errors[error as ErrorCode] : null
  const infoMessage = (INFO_CODES as readonly string[]).includes(info ?? '') ? d.info[info as InfoCode] : null

  const methodLabel = (provider: string) =>
    provider === 'email' ? d.method_email : provider === 'google' ? d.method_google : provider.charAt(0).toUpperCase() + provider.slice(1)
  const providers = (user.identities ?? []).map((identity) => identity.provider)

  return (
    <>
      <PageTitle title={d.security_title} subtitle={d.security_subtitle} />
      <Flash error={errorMessage} info={infoMessage} />

      <Section title={d.email_title}>
        <form action={changeEmailAction} className="space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div className="space-y-1.5">
            <Label htmlFor="current-email">{d.email_current}</Label>
            <Input id="current-email" value={user.email ?? ''} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">{d.email_new_label}</Label>
            <Input id="new-email" name="email" type="email" required autoComplete="email" />
            <p className="text-xs text-muted-foreground">{d.email_change_hint}</p>
          </div>
          <Button type="submit" variant="outline">{d.email_change_button}</Button>
        </form>
      </Section>

      <Section title={d.password_title}>
        <p className="text-sm text-muted-foreground">{d.password_hint}</p>
        <Button asChild variant="outline">
          <a href={`/${lang}/update-password`}>{d.change_password}</a>
        </Button>
      </Section>

      <Section title={d.methods_title}>
        <ul className="text-sm space-y-1">
          {providers.map((provider) => (
            <li key={provider} className="text-foreground">{methodLabel(provider)}</li>
          ))}
        </ul>
      </Section>

      <Section title={d.sessions_title}>
        <p className="text-sm text-muted-foreground">{d.sessions_hint}</p>
        <form action={signOutEverywhereAction}>
          <input type="hidden" name="lang" value={lang} />
          <Button type="submit" variant="outline">{d.sessions_button}</Button>
        </form>
      </Section>
    </>
  )
}
