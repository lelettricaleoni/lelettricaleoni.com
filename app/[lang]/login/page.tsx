import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { LoginForm } from './login-form'

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ error?: string; info?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const { error, info } = await searchParams
  const dict = await getDictionary(lang)
  const d = dict.login

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} dict={dict} />

      <div className="flex flex-1 pt-16">
        {/* Left panel */}
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <Image src="/images/about.webp" alt="" fill className="object-cover" priority />
          <div className="absolute bottom-12 left-12 right-12 z-10 space-y-3">
            <h2 className="text-3xl font-bold text-white leading-tight drop-shadow-lg whitespace-pre-line">
              {d.left_title}
            </h2>
            <p className="text-white/80 text-sm drop-shadow">{d.gdpr}</p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">{d.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{d.subtitle}</p>
            </div>
            <LoginForm lang={lang} d={d} error={error} info={info} />
          </div>
        </div>
      </div>
    </div>
  )
}
