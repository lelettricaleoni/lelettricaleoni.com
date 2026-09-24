'use client'
import { useState, type ReactNode } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { BikeCard } from './bike-card'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import type { BikeModel, BikeModelTranslation, BikeCategory, RouteBikeCategory, BikeSize } from '@/lib/db'

interface BikeModelWithData {
  model: BikeModel
  translation: BikeModelTranslation
  category: BikeCategory
  routeCategory?: RouteBikeCategory | null
  sizesInGarage: BikeSize[]
  media: ReactNode
}

interface BikeFiltersProps {
  models: BikeModelWithData[]
  lang: string
  dict: { bikes: Record<string, string> }
}

const PILL_ACTIVE   = 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
const PILL_INACTIVE = 'bg-background text-muted-foreground border-border hover:border-[#366DA1] hover:text-[#366DA1]'

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()]
}

export function BikeFilters({ models, lang, dict }: BikeFiltersProps) {
  const d = dict.bikes
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [activeSizeId, setActiveSizeId] = useState<string | null>(null)

  const filtered = models.filter(({ category, sizesInGarage }) => {
    if (activeCategoryId && category.id !== activeCategoryId) return false
    if (activeSizeId && !sizesInGarage.some((s) => s.id === activeSizeId)) return false
    return true
  })

  const availableCategories = uniqueById(models.map((m) => m.category))
  const availableSizes = uniqueById(models.flatMap((m) => m.sizesInGarage))

  const activeFilterCount = (activeCategoryId ? 1 : 0) + (activeSizeId ? 1 : 0)

  function toggle(current: string | null, value: string, set: (v: string | null) => void, filterType: string) {
    set(current === value ? null : value)
    trackEvent('filter_bikes', { filter_type: filterType, filter_value: value })
  }

  function resetFilters() {
    setActiveCategoryId(null)
    setActiveSizeId(null)
  }

  const resultsLabel = (filtered.length === 1 ? d.results_count_one : d.results_count_other)
    .replace('{count}', String(filtered.length))

  return (
    <div className="space-y-6">
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
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-white text-[#1e3a5f]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" collisionPadding={8} className="w-72 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_category}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategoryId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeCategoryId === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => toggle(activeCategoryId, category.id, setActiveCategoryId, 'category')}
                    className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeCategoryId === category.id ? PILL_ACTIVE : PILL_INACTIVE)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{d.filter_size}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveSizeId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeSizeId === null ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d.filter_all}
                </button>
                {availableSizes.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => toggle(activeSizeId, size.id, setActiveSizeId, 'size')}
                    className={cn('px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors', activeSizeId === size.id ? PILL_ACTIVE : PILL_INACTIVE)}
                  >
                    {size.name}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex justify-end pt-3 border-t">
                <Button variant="outline" size="sm" onClick={resetFilters} className="h-8 text-xs gap-1.5 text-muted-foreground">
                  <RotateCcw size={13} />
                  {d.no_results_reset}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{resultsLabel}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[50vh] text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
            <SlidersHorizontal size={24} className="text-muted-foreground" />
          </div>
          <p className="font-medium text-[#1e3a5f]">{d.no_results}</p>
          <button onClick={resetFilters} className="text-sm font-medium text-[#366DA1] cursor-pointer hover:underline underline-offset-4">
            {d.no_results_reset}
          </button>
        </div>
      ) : (
        <div className={cn(
          'grid gap-x-6 gap-y-0',
          filtered.length === 1 ? 'grid-cols-1 max-w-sm' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}>
          {filtered.map(({ model, translation, category, routeCategory, media }) => (
            <BikeCard
              key={model.id}
              model={model}
              translation={translation}
              category={category}
              routeCategory={routeCategory}
              media={media}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      )}
    </div>
  )
}
