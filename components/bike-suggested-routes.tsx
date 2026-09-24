import { Suspense } from 'react'
import { RouteCard } from '@/components/route-card'
import { RouteCardMediaAsync } from '@/components/route-card-media-async'
import { Skeleton } from '@/components/ui/skeleton'
import type { Route, RouteTranslation } from '@/lib/db'

interface SuggestedRoute {
  route: Route
  translation: RouteTranslation
}

export function BikeSuggestedRoutes({
  routes, lang, dict, title,
}: {
  routes: SuggestedRoute[]
  lang: string
  dict: { routes: Record<string, string> }
  title: string
}) {
  if (routes.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-[#1e3a5f]">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0">
        {routes.map(({ route, translation }) => (
          <RouteCard
            key={route.id}
            route={route}
            translation={translation}
            // Il media di ogni card fa query proprie e non cache-ate (foto/video
            // su R2, punti GPX): senza un confine Suspense per card, il dettaglio
            // bici aspetterebbe N lookup concorrenti prima di mostrare qualunque
            // cosa — stessa regola di /routes e delle card bici (STATE.md).
            media={
              <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
                <RouteCardMediaAsync route={route} routeName={translation.name} />
              </Suspense>
            }
            lang={lang}
            dict={dict}
          />
        ))}
      </div>
    </div>
  )
}
