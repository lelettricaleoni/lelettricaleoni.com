'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { RouteCard } from './route-card'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteWithData {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
}

interface RouteFiltersProps {
  routes: RouteWithData[]
  lang: string
  dict: { percorsi: Record<string, string> }
}

const DIFFICULTY_KEYS = ['easy', 'medium', 'hard', 'expert'] as const
const BIKE_TYPES = ['eMTB', 'MTB', 'Road Bike', 'E-Road Bike', 'Gravel', 'E-Gravel', 'City Bike', 'E-City Bike']

export function RouteFilters({ routes, lang, dict }: RouteFiltersProps) {
  const d = dict.percorsi
  const [activeDifficulty, setActiveDifficulty] = useState<string | null>(null)
  const [activeBikeType, setActiveBikeType] = useState<string | null>(null)

  const filtered = routes.filter(({ route }) => {
    if (activeDifficulty && route.difficulty !== activeDifficulty) return false
    if (activeBikeType && !route.bikeTypes.includes(activeBikeType)) return false
    return true
  })

  const availableBikeTypes = [...new Set(routes.flatMap((r) => r.route.bikeTypes))]
    .filter((t) => BIKE_TYPES.includes(t))

  function toggle<T extends string>(current: T | null, value: T, set: (v: T | null) => void) {
    set(current === value ? null : value)
    if (typeof window !== 'undefined') {
      window.gtag?.('event', 'filter_routes', { filter_type: 'difficulty', filter_value: value })
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted-foreground self-center mr-1">{d.filter_difficulty}:</span>
          {DIFFICULTY_KEYS.map((d_key) => (
            <button
              key={d_key}
              onClick={() => toggle(activeDifficulty, d_key, setActiveDifficulty)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                activeDifficulty === d_key
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-background text-muted-foreground border-border hover:border-[#366DA1]'
              )}
            >
              {d[`difficulty_${d_key}` as keyof typeof d]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted-foreground self-center mr-1">Bici:</span>
          {availableBikeTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggle(activeBikeType, type, setActiveBikeType)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                activeBikeType === type
                  ? 'bg-[#366DA1] text-white border-[#366DA1]'
                  : 'bg-background text-muted-foreground border-border hover:border-[#366DA1]'
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Griglia */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{d.no_results}</p>
      ) : (
        <div className={cn(
          'grid gap-6',
          'grid-cols-1'
        )}>
          {filtered.map(({ route, translation, coverPhoto }) => (
            <RouteCard
              key={route.id}
              route={route}
              translation={translation}
              coverPhoto={coverPhoto}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      )}
    </div>
  )
}
