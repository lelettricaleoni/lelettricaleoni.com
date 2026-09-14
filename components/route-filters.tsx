'use client'
import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, RotateCcw, Images, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { RouteCard } from './route-card'
import { BikeTypeIcon } from './bike-type-icon'
import { DIFFICULTY_STYLES, DIFFICULTY_ACTIVE_STYLES } from './difficulty-badge'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import { PreviewModeProvider, type PreviewMode } from './route-preview-mode'
import type { Route, RouteTranslation } from '@/lib/db'

interface RouteWithData {
  route: Route
  translation: RouteTranslation
  media: ReactNode
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
  // Never persisted: reset to the default every visit, same as the filters
  // above — the alternative is remembering a choice most visitors never make.
  const [previewMode, setPreviewMode] = useState<PreviewMode>('media')

  const filtered = routes.filter(({ route }) => {
    if (activeDifficulty && route.difficulty !== activeDifficulty) return false
    if (activeBikeType && !route.bikeTypes.includes(activeBikeType)) return false
    return true
  })

  const availableDifficulties = DIFFICULTY_KEYS.filter((k) => routes.some((r) => r.route.difficulty === k))
  const availableBikeTypes = [...new Set(routes.flatMap((r) => r.route.bikeTypes))]
    .filter((t) => BIKE_TYPES.includes(t))

  const activeFilterCount = (activeDifficulty ? 1 : 0) + (activeBikeType ? 1 : 0)

  function toggle<T extends string>(
    current: T | null, value: T, set: (v: T | null) => void, filterType: string
  ) {
    set(current === value ? null : value)
    trackEvent('filter_routes', { filter_type: filterType, filter_value: value })
  }

  function onPreviewModeChange(value: string) {
    setPreviewMode(value as PreviewMode)
    trackEvent('toggle_route_preview', { preview_mode: value })
  }

  const resultsLabel = (filtered.length === 1 ? d.results_count_one : d.results_count_other)
    .replace('{count}', String(filtered.length))

  return (
    <div className="space-y-6">
      {/* Barra: apre il pannello filtri, mostra quanti risultati restano, e a
          destra l'interruttore foto/video ↔ mappa per l'intera griglia. */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border cursor-pointer transition-colors shrink-0',
              activeFilterCount > 0 ? PILL_ACTIVE : PILL_INACTIVE
            )}>
              <SlidersHorizontal size={15} />
              {d.filters_button}
              {activeFilterCount > 0 && (
                <span className={cn(
                  'flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
                  'bg-white text-[#1e3a5f]'
                )}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          {/* w-72 fisso, non `100vw`: su alcuni motori quell'unità include la
              scrollbar verticale, e a 320px il conto lasciava uscire il pannello
              dallo schermo. collisionPadding lascia a Radix il compito di
              scostarlo dai bordi invece di calcolarli qui a mano. */}
          <PopoverContent align="start" collisionPadding={8} className="w-72 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_difficulty}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveDifficulty(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeDifficulty === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableDifficulties.map((key) => (
                  <button
                    key={key}
                    onClick={() => toggle(activeDifficulty, key, setActiveDifficulty, 'difficulty')}
                    className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors',
                      activeDifficulty === key ? DIFFICULTY_ACTIVE_STYLES[key] : DIFFICULTY_STYLES[key])}
                  >
                    {d[`difficulty_${key}` as keyof typeof d]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_bike_type}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveBikeType(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeBikeType === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableBikeTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggle(activeBikeType, type, setActiveBikeType, 'bike_type')}
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

            {activeFilterCount > 0 && (
              <div className="flex justify-end pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setActiveDifficulty(null); setActiveBikeType(null) }}
                  className="h-8 text-xs gap-1.5 text-muted-foreground"
                >
                  <RotateCcw size={13} />
                  {d.no_results_reset}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{resultsLabel}</span>

        <div className="flex-1" />

        {/* Un solo controllo per l'intera griglia, non per singola card —
            decide se le card mostrano il loro media di copertina o la
            traccia GPX. Le classi ricalcano apposta quelle di TabsList/
            TabsTrigger (stesso linguaggio visivo, due caselle in una
            capsula), ma sotto è un solo <button>: un bersaglio, che inverte
            sempre lo stato ovunque venga premuto — non due schede di cui
            una sola, quella inattiva, fa qualcosa al click. */}
        <button
          type="button"
          role="switch"
          aria-checked={previewMode === 'map'}
          aria-label={`${d.preview_mode_media} / ${d.preview_mode_map}`}
          onClick={() => onPreviewModeChange(previewMode === 'media' ? 'map' : 'media')}
          className="inline-flex items-center h-9 p-1 gap-1 rounded-md bg-muted cursor-pointer shrink-0"
        >
          <span className={cn(
            'inline-flex items-center justify-center h-7 w-8 rounded-sm transition-colors',
            previewMode === 'media' ? 'bg-background text-[#1e3a5f] shadow-sm' : 'text-muted-foreground'
          )}>
            <Images size={15} />
          </span>
          <span className={cn(
            'inline-flex items-center justify-center h-7 w-8 rounded-sm transition-colors',
            previewMode === 'map' ? 'bg-background text-[#1e3a5f] shadow-sm' : 'text-muted-foreground'
          )}>
            <MapIcon size={15} />
          </span>
        </button>
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
        <PreviewModeProvider value={previewMode}>
          {/* Le card spannano quattro righe di questa griglia e le condividono
              con le vicine (grid-rows-subgrid), così le loro fasce si allineano.
              Il gap verticale qui vale fra quelle righe, cioè *dentro* la card:
              sta a zero, e lo spazio fra card lo mette la card stessa con mb-6. */}
          <div className={cn(
            'grid gap-x-6 gap-y-0',
            filtered.length === 1
              ? 'grid-cols-1 max-w-sm'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}>
            {filtered.map(({ route, translation, media }) => (
              <RouteCard
                key={route.id}
                route={route}
                translation={translation}
                media={media}
                lang={lang}
                dict={dict}
              />
            ))}
          </div>
        </PreviewModeProvider>
      )}
    </div>
  )
}
