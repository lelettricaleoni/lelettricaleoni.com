import { notFound } from 'next/navigation'
import { getDictionary, hasLocale } from '../../../dictionaries'
import { Flash, PageTitle, Section } from '@/components/account/flash'
import { ExportDataButton } from '@/components/account/export-data-button'
import { DeleteAccount } from '@/components/account/delete-account'
import { hasAdminRole } from '@/lib/admin-users'
import { getCurrentUser } from '@/lib/auth/current-user'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

const ERROR_CODES = ['confirm_mismatch', 'delete_failed'] as const
type ErrorCode = (typeof ERROR_CODES)[number]

/** A copy of the person's data, and the way to delete the account. */
export default async function PrivacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  // The layout has already sent somebody who is not signed in to the sign-in page.
  const user = (await getCurrentUser())!

  const { error } = await searchParams
  const d = (await getDictionary(lang)).account
  const errorMessage = (ERROR_CODES as readonly string[]).includes(error ?? '') ? d.errors[error as ErrorCode] : null

  return (
    <>
      <PageTitle title={d.privacy_title} subtitle={d.privacy_subtitle} />
      <Flash error={errorMessage} />

      <Section title={d.export_title}>
        <p className="text-sm text-muted-foreground">{d.export_hint}</p>
        <ExportDataButton label={d.export_button} failed={d.errors.export_failed} />
      </Section>

      <Section title={d.delete_title}>
        {hasAdminRole(user) ? (
          <p className="text-sm text-muted-foreground">{d.delete_staff}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{d.delete_hint}</p>
            <DeleteAccount
              lang={lang}
              email={user.email ?? ''}
              labels={{
                open: d.delete_button,
                title: d.delete_title,
                description: d.delete_hint,
                confirm: d.delete_confirm_label,
                cancel: d.cancel,
                submit: d.delete_button,
              }}
            />
          </>
        )}
      </Section>
    </>
  )
}
