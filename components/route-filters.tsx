'use client'
import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RouteCard } from './route-card'
import { BikeTypeIcon } from './bike-type-icon'
import { DIFFICULTY_STYLES, DIFFICULTY_ACTIVE_STYLES } from './difficulty-badge'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteWithData {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
}

interface RouteFiltersProps {
  routes: RouteWithData[]
  lang: string
  dict: { routes: Record<string, string> }
}

const DIFFICULTY_KEYS = ['easy', 'medium', 'hard', 'expert'] as const
const BIKE_TYPES = ['eMTB', 'MTB', 'Road Bike', 'E-Road Bike', 'Gravel', 'E-Gravel', 'City Bike', 'E-City Bike']

const PILL_ACTIVE   = 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
const PILL_INACTIVE = 'bg-background text-muted-foreground border-border hover:border-[#366DA1] hover:text-[#366DA1]'

export function RouteFilters({ routes, lang, dict }: RouteFiltersProps) {
  const d = dict.routes
  const [activeDifficulty, setActiveDifficulty] = useState<string | null>(null)
  const [activeBikeType, setActiveBikeType] = useState<string | null>(null)

  const filtered = routes.filter(({ route }) => {
    if (activeDifficulty && route.difficulty !== activeDifficulty) return false
    if (activeBikeType && !route.bikeTypes.includes(activeBikeType)) return false
    return true
  })

  const availableDifficulties = DIFFICULTY_KEYS.filter((k) => routes.some((r) => r.route.difficulty === k))
  const availableBikeTypes = [...new Set(routes.flatMap((r) => r.route.bikeTypes))]
    .filter((t) => BIKE_TYPES.includes(t))

  function toggle<T extends string>(current: T | null, value: T, set: (v: T | null) => void) {
    set(current === value ? null : value)
    window.gtag?.('event', 'filter_routes', { filter_type: 'difficulty', filter_value: value })
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <div className="space-y-3">
        {/* Difficoltà */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-muted-foreground mr-1">{d.filter_difficulty}:</span>
          <button
            onClick={() => setActiveDifficulty(null)}
            className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeDifficulty === null ? PILL_ACTIVE : PILL_INACTIVE)}
          >
            {d.filter_all}
          </button>
          {availableDifficulties.map((key) => (
            <button
              key={key}
              onClick={() => toggle(activeDifficulty, key, setActiveDifficulty)}
              className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors',
                activeDifficulty === key ? DIFFICULTY_ACTIVE_STYLES[key] : DIFFICULTY_STYLES[key])}
            >
              {d[`difficulty_${key}` as keyof typeof d]}
            </button>
          ))}
        </div>

        {/* Tipo di bici */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Bike:</span>
          <button
            onClick={() => setActiveBikeType(null)}
            className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeBikeType === null ? PILL_ACTIVE : PILL_INACTIVE)}
          >
            {d.filter_all}
          </button>
          {availableBikeTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggle(activeBikeType, type, setActiveBikeType)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors',
                activeBikeType === type ? PILL_ACTIVE : PILL_INACTIVE
              )}
            >
              <BikeTypeIcon type={type} size={12} />
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Griglia */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[50vh] text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
            <SlidersHorizontal size={24} className="text-muted-foreground" />
          </div>
          <p className="font-medium text-[#1e3a5f]">{d.no_results}</p>
          <button
            onClick={() => { setActiveDifficulty(null); setActiveBikeType(null) }}
            className="text-sm font-medium text-[#366DA1] cursor-pointer hover:underline underline-offset-4"
          >
            {d.no_results_reset}
          </button>
        </div>
      ) : (
        <div className={cn(
          'grid gap-6',
          filtered.length === 1
            ? 'grid-cols-1 max-w-sm'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
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
