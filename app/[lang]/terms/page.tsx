import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LuArrowLeft } from 'react-icons/lu'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Separator } from '@/components/ui/separator'
import { buildSocialMetadata } from '@/lib/metadata'

// Like the privacy page, which this one follows: the dictionary is read per request, so the page is not prerendered.
export const instant = false

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

/** A text of the dictionary with line breaks in it is several paragraphs. */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split('\n').map((paragraph) => (
        <p key={paragraph} className="text-muted-foreground leading-relaxed">{paragraph}</p>
      ))}
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const { terms } = await getDictionary(lang)
  return {
    title: terms.title,
    description: terms.meta_description,
    ...buildSocialMetadata({ lang, title: terms.title, description: terms.meta_description, url: `${siteUrl}/${lang}/terms` }),
    alternates: { canonical: `${siteUrl}/${lang}/terms` },
  }
}

/**
 * The terms of rental that a person accepts before paying. They are written on the facts that are decided (full payment up front, full
 * refund up to a deadline, whole days, pickup and return times) and shown as a draft until somebody has reviewed them: the notice at the
 * top is removed with that review, and it is on the list of what blocks the release (docs/ai/ROADMAP.md).
 */
export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const t = dict.terms
  const sections = [
    [t.seller_title, t.seller_body],
    [t.booking_title, t.booking_body],
    [t.payment_title, t.payment_body],
    [t.pickup_title, t.pickup_body],
    [t.cancel_title, t.cancel_body],
    [t.withdrawal_title, t.withdrawal_body],
  ] as const

  return (
    <>
      <Navbar lang={lang} dict={dict} />
      <div className="min-h-screen bg-white pt-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
          <Link
            href={`/${lang}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
          >
            <LuArrowLeft size={14} /> {lang === 'it' ? 'Torna alla home' : lang === 'de' ? 'Zurück zur Startseite' : 'Back to home'}
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">{t.title}</h1>
          <p className="text-sm text-muted-foreground mb-6">{t.last_updated}</p>
          <p className="mb-10 rounded-lg border bg-muted px-4 py-3 text-sm text-foreground">{t.draft_notice}</p>

          <Separator className="mb-10" />

          <div className="space-y-8 text-foreground">
            {sections.map(([title, body]) => (
              <section key={title}>
                <h2 className="text-lg font-semibold mb-3">{title}</h2>
                <Paragraphs text={body} />
              </section>
            ))}

            <section>
              <h2 className="text-lg font-semibold mb-3">{t.data_title}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t.data_body}{' '}
                <Link href={`/${lang}/privacy`} className="text-primary hover:underline">{t.data_link}</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
