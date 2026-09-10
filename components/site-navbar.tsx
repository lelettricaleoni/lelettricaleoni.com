import { Suspense } from 'react'
import { Navbar } from './navbar'
import { getFlags } from '@/lib/flags'

interface SiteNavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string }
    routes?: { nav_label: string }
  }
}

/**
 * Whether the routes section is reachable is a kill switch: it can change
 * without a deploy, so it can only be read at request time. Every page carries
 * the navbar, so reading it directly in a page would make that page render on
 * demand — which is exactly what kept the whole site dynamic before.
 *
 * The read lives in its own Suspense boundary instead. The prerendered shell
 * carries a navbar without the routes link, and the real one replaces it as
 * soon as the flag resolves — a few milliseconds, since `getFlags` serves a
 * cached value and never waits on the service.
 *
 * The fallback hides the link rather than showing it: a link that turns out to
 * lead nowhere is worse than one that appears a moment late.
 */
async function NavbarWithFlags({ lang, dict }: SiteNavbarProps) {
  const { routes } = await getFlags()
  return <Navbar lang={lang} dict={dict} showRoutes={routes} />
}

export function SiteNavbar({ lang, dict }: SiteNavbarProps) {
  return (
    <Suspense fallback={<Navbar lang={lang} dict={dict} showRoutes={false} />}>
      <NavbarWithFlags lang={lang} dict={dict} />
    </Suspense>
  )
}
