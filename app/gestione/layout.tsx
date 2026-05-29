import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gestione — Lelettrica',
  robots: { index: false, follow: false },
}

export default function GestioneRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
