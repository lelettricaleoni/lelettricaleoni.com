import { redirect } from 'next/navigation'
import { languageOf } from '@/lib/auth/language'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

/** `/account` has no page of its own: it is the first of the settings (the rentals will have theirs). */
export default async function AccountIndex({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  redirect(`/${languageOf(lang)}/account/settings`)
}
