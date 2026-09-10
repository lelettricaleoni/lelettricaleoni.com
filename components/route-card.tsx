import type { ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { BikeTypeIcon, bikeTypeBadgeClass } from '@/components/bike-type-icon'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { shortRouteId } from '@/lib/utils'
import type { Route, RouteTranslation } from '@/lib/db'

interface RouteCardProps {
  route: Route
  translation: RouteTranslation
  media: ReactNode
  lang: string
  dict: { routes: Record<string, string> }
}

/**
 * A card in the routes list.
 *
 * Its four bands — media, title, tags, stats — are rows of the parent grid
 * rather than of the card, so the same band sits at the same height across
 * every card in a row. A title that needs two lines pushes the tags down on
 * all of them at once, instead of only on its own card.
 *
 * That is what `grid-rows-subgrid` buys over reserving a fixed height for the
 * title: when every title in a row is short, the row simply stays compact.
 */
export function RouteCard({ route, translation, media, lang, dict }: RouteCardProps) {
  const d = dict.routes

  const stats = [
    route.distanceKm ? { value: `${route.distanceKm}`, label: d.stat_distance } : null,
    route.elevationM != null ? { value: `${route.elevationM}`, label: `↑ ${d.stat_elevation}` } : null,
    route.durationMin ? { value: `${Math.floor(route.durationMin / 60)}h${route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}`, label: d.stat_duration } : null,
    { value: d[`surface_${route.surface}` as keyof typeof d] ?? route.surface, label: d.stat_surface },
  ].filter(Boolean) as { value: string; label: string }[]

  return (
    <Link
      href={`/${lang}/routes/${shortRouteId(route.id)}`}
      className="group grid grid-rows-subgrid row-span-4 gap-y-3 mb-6 rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow"
    >
      <div className="relative h-48 bg-[#c8dae8] overflow-hidden">
        {media}
        <DifficultyBadge
          difficulty={route.difficulty}
          label={d[`difficulty_${route.difficulty}` as keyof typeof d] ?? route.difficulty}
          className="absolute top-3 right-3 shadow-sm z-10"
        />
      </div>

      <h3 className="px-4 font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
        {translation.name}
      </h3>

      {/* One line, scrolled by hand. A marquee would make the reader wait for
          the tag they want to come round again, and would have to be turned
          off under prefers-reduced-motion anyway. The fade says there is more
          without moving; pan-x keeps a sideways drag from reading as a tap on
          the link. */}
      <div className="relative px-4 after:pointer-events-none after:absolute after:inset-y-0 after:right-4 after:w-8 after:bg-gradient-to-l after:from-card after:to-transparent">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
          {route.bikeTypes.map((type) => (
            <Badge
              key={type}
              variant="outline"
              className={`shrink-0 text-xs flex items-center gap-1 font-medium ${bikeTypeBadgeClass(type)}`}
            >
              <BikeTypeIcon type={type} size={12} />
              {type}
            </Badge>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="flex rounded-lg border bg-muted/30 overflow-hidden divide-x divide-border">
          {stats.map((stat) => (
            <div key={stat.label} className="flex-1 min-w-0 py-2 px-1 text-center">
              <p className="text-sm font-bold text-[#1e3a5f] truncate leading-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </Link>
  )
}
