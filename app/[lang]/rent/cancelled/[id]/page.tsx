import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { hasLocale } from '../../../dictionaries'
import { getCurrentUser } from '@/lib/auth/current-user'
import { abandonMyCheckout } from '@/lib/booking/rent-actions'

export const instant = false

/**
 * Where the payment page sends a person who went back without paying (`cancel_url`). The payment session is closed FIRST and the
 * bikes are freed at once (`abandonMyCheckout`), then the person goes back to the checkout page with the booking as they left it. If they
 * had already paid, the booking is theirs and they go to see it. Only a booking of the signed-in person is touched.
 */
export default async function CancelledPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!hasLocale(lang)) notFound()
  await connection()

  const user = await getCurrentUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/rent`)}`)

  const result = await abandonMyCheckout(user, id, lang)
  if (result.status === 'abandoned') redirect(result.href)
  if (result.status === 'paid') redirect(`/${lang}/account/rents/${id}?paid=1`)
  redirect(`/${lang}/rent`)
}
