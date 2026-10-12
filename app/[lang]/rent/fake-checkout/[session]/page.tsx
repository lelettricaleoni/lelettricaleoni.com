import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { FakePayForm } from '@/components/rent/fake-pay-form'
import { getCurrentUser } from '@/lib/auth/current-user'
import { PaymentsNotConfiguredError, getFakeGateway } from '@/lib/booking/payments'
import { formatPrice } from '@/lib/money'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const instant = false

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * The page that stands in for the card form, on staging and on a laptop: it does not exist in production (`getFakeGateway` refuses
 * there, and that is a 404 here). It pays nothing, and says so.
 */
export default async function FakeCheckoutPage({ params }: { params: Promise<{ lang: string; session: string }> }) {
  const { lang, session } = await params
  if (!hasLocale(lang)) notFound()
  await connection()

  let fake
  try {
    fake = getFakeGateway()
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError) notFound()
    throw error
  }

  const user = await getCurrentUser()
  if (!user) redirect(`/${lang}/login?next=${encodeURIComponent(`/${lang}/rent/fake-checkout/${session}`)}`)

  const dict = await getDictionary(lang)
  const d = dict.rent.fake
  const described = fake.describe(session)
  const state = described ? await fake.getSession(session) : null
  const back = described ? new URL(described.cancelUrl) : null

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <main className="w-full pb-16 pt-24">
        <div className="mx-auto max-w-lg space-y-6 px-4 sm:px-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{d.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{d.body}</p>
          </div>
          {!described || !back ? (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{d.unknown}</p>
          ) : (
            <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
              <ul className="space-y-2 text-sm">
                {described.lines.map((line, index) => (
                  <li key={index} className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground">{line.label}</span>
                    <span className="tabular-nums text-muted-foreground">{formatPrice(line.amountCents, lang)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="font-semibold text-foreground">{d.total}</span>
                <span className="text-xl font-bold tabular-nums text-primary">
                  {formatPrice(described.lines.reduce((sum, line) => sum + line.amountCents, 0), lang)}
                </span>
              </div>
              {state?.status === 'open' ? (
                <FakePayForm sessionId={session} labels={{ pay: d.pay, back: d.back, notPayable: d.not_payable }} backHref={`${back.pathname}${back.search}`} />
              ) : (
                <>
                  <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{d.not_payable}</p>
                  <Button asChild variant="outline" className="w-full"><Link href={`/${lang}/rent`}>{d.back}</Link></Button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
