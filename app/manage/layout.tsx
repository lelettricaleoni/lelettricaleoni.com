import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manage · Lelettrica',
  robots: { index: false, follow: false },
}

export default function ManageRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
