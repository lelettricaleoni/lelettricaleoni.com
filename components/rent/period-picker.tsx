'use client'

import { useEffect, useMemo, useState } from 'react'
import { de as dpDe, enGB as dpEn, it as dpIt } from 'react-day-picker/locale'
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuChevronUp } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { pageWeek, weekDays, weekStartFor } from '@/lib/booking/period-strip'
import { pickDay, rangeToSelection, selectionToRange, type Selection } from '@/lib/booking/period-selection'
import { isSelectable, type DayReason, type PickContext, type UnitBusy } from '@/lib/booking/day-availability'
import { isClosedOn, type ShopSchedule } from '@/lib/shop-schedule'
import { fill, formatDay, formatDays } from '@/lib/booking/format'
import { daysBetween, dayToDate, isoDay, type DayRange, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { RentDict } from './rent-flow'

type Lang = 'it' | 'en' | 'de'

const INTL_LOCALE = { it: 'it-IT', en: 'en-GB', de: 'de-DE' } as const
const CALENDAR_LOCALE = { it: dpIt, en: dpEn, de: dpDe } as const
/** The days that get a grey box (the bike is taken, the shop is closed, out of reach of one bike); past and too-far days are only faded. */
const UNAVAILABLE: ReadonlySet<DayReason> = new Set(['no_bike', 'beyond_end', 'closed'])

/**
 * The days of the stay: a bar of seven days with an arrow on each side (a week at a time, the weekdays under their names), and under it
 * the arrow that opens the whole month. Two taps make a stay: the first and the last day (the same day twice is one day; a tap before the
 * first starts again from there). A day that cannot be chosen is greyed and says why in its name and its tooltip.
 * What can be chosen comes from `lib/booking/day-availability.ts`, `period-selection.ts` and `period-strip.ts` (tested there); the server
 * checks the stay again when the person pays. The days live in the address: choosing a stay hands it up (`onChange`), the page navigates.
 */
export function PeriodPicker({
  lang, dict, units, schedule, range, minDay, maxDay, maxDays, mode, pending, onChange,
}: {
  lang: Lang
  dict: RentDict
  units: UnitBusy[]
  /** When the shop is open: a closed day cannot be the first or the last day (a stay may go through one). */
  schedule: ShopSchedule
  range: DayRange | null
  minDay: IsoDate
  maxDay: IsoDate
  /** The category's limit in days when one bike is being booked; null when booking by days. */
  maxDays: number | null
  mode: 'days' | 'bike'
  pending: boolean
  onChange: (range: DayRange) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [selection, setSelection] = useState<Selection>(() => rangeToSelection(range))
  const [weekStart, setWeekStart] = useState(() => weekStartFor(range?.startsOn ?? minDay, { minDay, maxDay }))
  const wide = useWideScreen()

  const base = useMemo(
    () => ({ units, minDay, maxDay, maxDays, isClosed: (day: IsoDate) => isClosedOn(schedule, day) }),
    [units, schedule, minDay, maxDay, maxDays],
  )
  // While only the first day is chosen the last one is limited by it (and by how far one bike can go).
  const pickContext: PickContext = { ...base, start: selection.start !== null && selection.end === null ? selection.start : null }

  function reasonText(day: IsoDate, reason: DayReason): string {
    const key = {
      past: 'off_past', too_far: 'off_far', closed: 'off_closed', no_bike: mode === 'bike' ? 'off_no_bike_model' : 'off_no_bike', beyond_end: 'off_beyond',
    }[reason] as 'off_past' | 'off_far' | 'off_closed' | 'off_no_bike' | 'off_no_bike_model' | 'off_beyond'
    return fill(dict[key], { day: formatDay(day, lang) })
  }

  function tap(day: IsoDate) {
    const next = pickDay(selection, day)
    setSelection(next)
    const chosen = selectionToRange(next)
    if (chosen) onChange(chosen)
  }

  const days = weekDays(weekStart)
  const chosen = selectionToRange(selection)
  const before = pageWeek(weekStart, -1, { minDay, maxDay })
  const after = pageWeek(weekStart, 1, { minDay, maxDay })
  const weekday = new Intl.DateTimeFormat(INTL_LOCALE[lang], { weekday: 'short' })
  const month = new Intl.DateTimeFormat(INTL_LOCALE[lang], { month: 'long' })
  const monthYear = new Intl.DateTimeFormat(INTL_LOCALE[lang], { month: 'long', year: 'numeric' })
  const [firstShown, lastShown] = [dayToDate(days[0]), dayToDate(days[6])]
  const title = firstShown.getMonth() === lastShown.getMonth()
    ? monthYear.format(firstShown)
    : firstShown.getFullYear() === lastShown.getFullYear()
      ? `${month.format(firstShown)} – ${monthYear.format(lastShown)}`
      : `${monthYear.format(firstShown)} – ${monthYear.format(lastShown)}`

  const first = selection.start ? dayToDate(selection.start) : undefined
  const last = selection.end ? dayToDate(selection.end) : first

  return (
    <div className="space-y-3" aria-busy={pending}>
      {expanded ? (
        <div className="overflow-x-auto">
          <Calendar
            mode="range"
            selected={first ? { from: first, to: last } : undefined}
            // The taps are handled by `onDayClick` (the stay is made by `pickDay`, not by the grid's own range rules).
            onSelect={() => {}}
            onDayClick={(date) => tap(isoDay(date))}
            numberOfMonths={wide ? 2 : 1}
            locale={CALENDAR_LOCALE[lang]}
            defaultMonth={first ?? dayToDate(weekStart)}
            startMonth={dayToDate(minDay)}
            endMonth={dayToDate(maxDay)}
            disabled={(date) => !isSelectable(isoDay(date), pickContext).ok}
            labels={{
              labelDayButton: (date) => {
                const day = isoDay(date)
                const check = isSelectable(day, pickContext)
                return check.ok ? formatDay(day, lang) : reasonText(day, check.reason)
              },
            }}
            modifiers={{ unavailable: (date) => { const check = isSelectable(isoDay(date), pickContext); return !check.ok && UNAVAILABLE.has(check.reason) } }}
            modifiersClassNames={{ unavailable: 'rounded-md bg-muted' }}
            className="mx-auto p-0 [--cell-size:2.25rem] sm:[--cell-size:2.5rem]"
          />
        </div>
      ) : (
        <div className="mx-auto max-w-xl space-y-2">
          <p className="text-center text-sm font-medium capitalize text-foreground" aria-live="polite">{title}</p>
          <div className="flex items-stretch gap-1 sm:gap-2">
            <Button
              type="button" variant="outline" size="icon" className="h-auto w-8 shrink-0 sm:w-10" aria-label={dict.week_before}
              disabled={before === null} onClick={() => before && setWeekStart(before)}
            >
              <LuChevronLeft />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
              {days.map((day) => {
                const check = isSelectable(day, pickContext)
                const isEdge = day === selection.start || day === (selection.end ?? selection.start)
                const inside = selection.start !== null && selection.end !== null && day > selection.start && day < selection.end
                const label = check.ok ? formatDay(day, lang) : reasonText(day, check.reason)
                const grey = !check.ok && UNAVAILABLE.has(check.reason)
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!check.ok}
                    aria-label={label}
                    aria-pressed={check.ok ? isEdge || inside : undefined}
                    title={check.ok ? undefined : label}
                    onClick={() => tap(day)}
                    className={cn(
                      'flex min-w-0 flex-col items-center gap-1 rounded-md border px-0 py-2 transition-colors sm:gap-1.5 sm:py-3',
                      check.ok && 'cursor-pointer bg-card hover:bg-accent',
                      !check.ok && (grey ? 'bg-muted text-muted-foreground/60' : 'border-transparent text-muted-foreground/40'),
                      inside && 'bg-accent',
                    )}
                  >
                    <span className="text-[0.7rem] leading-none text-muted-foreground">{weekday.format(dayToDate(day))}</span>
                    <span className={cn('flex size-7 items-center justify-center rounded-full text-sm sm:size-8', isEdge && 'bg-primary font-semibold text-primary-foreground')}>
                      {dayToDate(day).getDate()}
                    </span>
                  </button>
                )
              })}
            </div>
            <Button
              type="button" variant="outline" size="icon" className="h-auto w-8 shrink-0 sm:w-10" aria-label={dict.week_after}
              disabled={after === null} onClick={() => after && setWeekStart(after)}
            >
              <LuChevronRight />
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? <LuChevronUp /> : <LuChevronDown />} {expanded ? dict.show_week : dict.show_month}
        </Button>
      </div>

      <p className="text-center text-sm" aria-live="polite">
        {chosen ? (
          <span className="font-medium text-foreground">
            {formatDays(chosen, lang, { weekday: true })} · {daysBetween(chosen.startsOn, chosen.endsOn) === 1 ? dict.days_one : fill(dict.days_other, { n: daysBetween(chosen.startsOn, chosen.endsOn) })}
          </span>
        ) : (
          <span className="text-muted-foreground">{dict.dates_prompt}</span>
        )}
      </p>
      <p className="text-center text-xs text-muted-foreground">{mode === 'bike' ? dict.legend_off_bike : dict.legend_off_days}</p>
    </div>
  )
}

/** Two months side by side only where there is room; one month on a phone. Starts at one so the server and the first paint agree. */
function useWideScreen() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}
