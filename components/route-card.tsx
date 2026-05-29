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

        <div className="grid grid-cols-4 gap-2 bg-muted/50 rounded-lg p-2.5">
          {route.distanceKm && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{route.distanceKm}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_distance}</p>
            </div>
          )}
          {route.elevationM != null && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{route.elevationM}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_elevation}</p>
            </div>
          )}
          {route.durationMin && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{Math.round(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_duration}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-sm font-bold text-[#1e3a5f] capitalize">{d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}</p>
            <p className="text-[10px] text-muted-foreground">{d.stat_surface}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
