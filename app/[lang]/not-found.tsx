import { NotFoundPage } from '@/components/not-found-page'

export const metadata = { title: '404 - Pagina non trovata | Lelettrica' }

/**
 * Shown when `notFound()` is called anywhere under `/[lang]` — a locale that
 * does not exist, a route id that does not, or a section the flags have
 * switched off. It renders inside this branch's root layout, so `<html lang>`
 * still matches the URL.
 *
 * URLs that match no route at all never reach here: they are served by
 * `app/global-not-found.tsx`.
 */
export default function NotFound() {
  return <NotFoundPage />
}
