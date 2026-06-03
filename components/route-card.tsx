import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { BikeTypeIcon, bikeTypeBadgeClass } from '@/components/bike-type-icon'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { r2PublicUrl } from '@/lib/r2'
import { shortRouteId } from '@/lib/utils'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteCardProps {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
  lang: string
  dict: { routes: Record<string, string> }
}

export function RouteCard({ route, translation, coverPhoto, lang, dict }: RouteCardProps) {
  const d = dict.routes

  return (
    <Link
      href={`/${lang}/routes/${shortRouteId(route.id)}`}
      className="group block rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow"
    >
      <div className="relative h-48 bg-[#c8dae8]">
        {coverPhoto && (
          <Image
            src={r2PublicUrl(coverPhoto.storageKey)}
            alt={coverPhoto.altText ?? translation.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        )}
        <DifficultyBadge
          difficulty={route.difficulty}
          label={d[`difficulty_${route.difficulty}` as keyof typeof d] ?? route.difficulty}
          className="absolute top-3 right-3 shadow-sm"
        />
      </div>

      <div className="p-4 space-y-3">
        <h3 className="font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
          {translation.name}
        </h3>

        <div className="flex flex-wrap gap-1.5">
          {route.bikeTypes.map((type) => (
            <Badge key={type} variant="outline" className={`text-xs flex items-center gap-1 font-medium ${bikeTypeBadgeClass(type)}`}>
              <BikeTypeIcon type={type} size={12} />
              {type}
            </Badge>
          ))}
        </div>

        {(() => {
          const stats = [
            route.distanceKm ? { value: `${route.distanceKm}`, label: d.stat_distance } : null,
            route.elevationM != null ? { value: `${route.elevationM}`, label: `↑ ${d.stat_elevation}` } : null,
            route.durationMin ? { value: `${Math.floor(route.durationMin / 60)}h${route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}`, label: d.stat_duration } : null,
            { value: d[`surface_${route.surface}` as keyof typeof d] ?? route.surface, label: d.stat_surface },
          ].filter(Boolean) as { value: string; label: string }[]

          return (
            <div className="flex rounded-lg border bg-muted/30 overflow-hidden divide-x divide-border">
              {stats.map((stat) => (
                <div key={stat.label} className="flex-1 min-w-0 py-2 px-1 text-center">
                  <p className="text-sm font-bold text-[#1e3a5f] truncate leading-tight">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </Link>
  )
}
