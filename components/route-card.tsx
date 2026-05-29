import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { r2PublicUrl } from '@/lib/r2'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteCardProps {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
  lang: string
  dict: { percorsi: Record<string, string> }
}

const difficultyColor: Record<string, string> = {
  easy: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard: 'bg-orange-100 text-orange-800',
  expert: 'bg-red-100 text-red-800',
}

export function RouteCard({ route, translation, coverPhoto, lang, dict }: RouteCardProps) {
  const d = dict.percorsi
  const difficultyKey = `difficulty_${route.difficulty}` as keyof typeof d

  return (
    <Link
      href={`/${lang}/percorsi/${route.slug}`}
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
        <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${difficultyColor[route.difficulty]}`}>
          {d[difficultyKey] ?? route.difficulty}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <h3 className="font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
          {translation.name}
        </h3>

        <div className="flex flex-wrap gap-1.5">
          {route.bikeTypes.map((type) => (
            <Badge key={type} variant="secondary" className="text-xs">{type}</Badge>
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
