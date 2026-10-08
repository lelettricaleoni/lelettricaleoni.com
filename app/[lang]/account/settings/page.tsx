import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Flash, PageTitle } from '@/components/account/flash'
import { db, customers } from '@/lib/db'
import { hasAdminRole } from '@/lib/admin-users'
import { getCurrentUser } from '@/lib/auth/current-user'
import { ensureCustomerFor } from '@/lib/auth/ensure-customer'
import { LANGUAGES, languageOf } from '@/lib/auth/language'
import { updateAccountAction } from '@/lib/actions/account'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

const ERROR_CODES = ['missing_name', 'invalid_phone', 'save_failed'] as const
type ErrorCode = (typeof ERROR_CODES)[number]

// Each language is named in itself: somebody who cannot read the page must still find theirs.
const LANGUAGE_NAMES: Record<(typeof LANGUAGES)[number], string> = { it: 'Italiano', en: 'English', de: 'Deutsch' }

/** Profile: name, phone, and the language of the site and of what the shop writes to the person. */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  // The layout has already sent somebody who is not signed in to the sign-in page.
  const user = (await getCurrentUser())!

  const isAdmin = hasAdminRole(user)
  // The record normally exists from the first sign-in; this covers one that could not be made then.
  if (!isAdmin) await ensureCustomerFor(user, { language: lang })
  const [customer] = isAdmin ? [] : await db.select().from(customers).where(eq(customers.userId, user.id))

  const { error, saved } = await searchParams
  const d = (await getDictionary(lang)).account
  const errorMessage = (ERROR_CODES as readonly string[]).includes(error ?? '') ? d.errors[error as ErrorCode] : null

  return (
    <>
      <PageTitle title={d.profile_title} subtitle={d.profile_subtitle} />
      <Flash error={errorMessage} info={saved === '1' ? d.saved : null} />

      <form action={updateAccountAction} className="space-y-4">
        <input type="hidden" name="lang" value={lang} />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="first_name">{d.first_name_label}</Label>
            <Input id="first_name" name="first_name" required maxLength={80} defaultValue={customer?.firstName ?? ''} disabled={isAdmin} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last_name">{d.last_name_label}</Label>
            <Input id="last_name" name="last_name" required maxLength={80} defaultValue={customer?.lastName ?? ''} disabled={isAdmin} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{d.email_label}</Label>
          <Input id="email" value={user.email ?? ''} readOnly disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{d.phone_label}</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={customer?.phone ?? ''} disabled={isAdmin} />
          <p className="text-xs text-muted-foreground">{d.phone_hint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language">{d.language_label}</Label>
          <Select name="language" defaultValue={languageOf(customer?.language ?? lang)} disabled={isAdmin}>
            <SelectTrigger id="language"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((code) => (
                <SelectItem key={code} value={code}>{LANGUAGE_NAMES[code]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{d.language_hint}</p>
        </div>
        {!isAdmin && <Button type="submit">{d.save}</Button>}
      </form>
    </>
  )
}
