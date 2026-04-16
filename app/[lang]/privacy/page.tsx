import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDictionary, hasLocale } from '../dictionaries'
import { Separator } from '@/components/ui/separator'

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const p = dict.privacy

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <Link
          href={`/${lang}`}
          className="text-sm text-muted-foreground hover:text-primary transition-colors mb-8 inline-block"
        >
          ← {lang === 'it' ? 'Torna alla home' : lang === 'de' ? 'Zurück zur Startseite' : 'Back to home'}
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2">{p.title}</h1>
        <p className="text-sm text-muted-foreground mb-10">{p.last_updated}</p>

        <Separator className="mb-10" />

        <div className="space-y-8 text-foreground">
          <section>
            <h2 className="text-lg font-semibold mb-3">{p.controller_title}</h2>
            <p className="text-muted-foreground leading-relaxed">
              Leoni Gabriele — Via Roma, 90, 38074 Dro (TN), Italia<br />
              lelettricaleoni@gmail.com
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">{p.data_title}</h2>
            <p className="text-muted-foreground leading-relaxed">{p.data_body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">{p.cookies_title}</h2>
            <p className="text-muted-foreground leading-relaxed">{p.cookies_body}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">{p.contact_title}</h2>
            <p className="text-muted-foreground leading-relaxed">{p.contact_body}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
