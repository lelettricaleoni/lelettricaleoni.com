import './globals.css'
import { Geist } from 'next/font/google'
import { NotFoundPage } from '@/components/not-found-page'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata = { title: '404 - Pagina non trovata | Lelettrica' }

export default function GlobalNotFound() {
  return (
    <html lang="it" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <NotFoundPage />
      </body>
    </html>
  )
}
