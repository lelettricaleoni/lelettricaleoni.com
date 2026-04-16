import { redirect } from 'next/navigation'

// The proxy handles locale redirect before reaching this page.
// This fallback ensures `/` always redirects to the Italian version.
export default function RootPage() {
  redirect('/it')
}
