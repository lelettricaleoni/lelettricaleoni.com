import type { Metadata } from 'next'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Manage · Lelettrica',
  robots: { index: false, follow: false },
}

export default function ManageRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
