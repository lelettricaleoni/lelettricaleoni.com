'use client'

import { useEffect, useMemo, useState } from 'react'
import { de as dpDe, enGB as dpEn, it as dpIt } from 'react-day-picker/locale'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { canBook, pickDay, rangeToSelection, selectionToRange, shiftRange } from '@/lib/booking/period-selection'
import { isSelectable, type DayReason, type PickContext, type UnitBusy } from '@/lib/booking/day-availability'
import { fill, formatDay, formatDays } from '@/lib/booking/format'
import { daysBetween, dayToDate, isoDay, type DayRange, type IsoDate } from '@/lib/dates'
import type { RentDict } from './rent-flow'

type Lang = 'it' | 'en' | 'de'

const CALENDAR_LOCALE = { it: dpIt, en: dpEn, de: dpDe } as const

/**
 * The days of the stay. Two states of one component:
 *  - open (nothing chosen yet, or "Change"): the month grid, a day greyed out when it cannot be chosen, with the reason in its name;
 *  - compact (a stay is chosen): one row with the days and "day before / day after", which move the whole stay by a day, so the person
 *    can walk through the calendar and watch the bikes free for each stay change below.
 * What can be chosen comes from `lib/booking/day-availability.ts` and `period-selection.ts` (tested there); the server checks the stay
 * again when the person pays. The days live in the address: choosing a stay hands it up (`onChange`), and the page does the navigation.
 */
export function PeriodPicker({
  lang, dict, units, range, minDay, maxDay, maxDays, mode, pending, onChange,
}: {
  lang: Lang
  dict: RentDict
  units: UnitBusy[]
  range: DayRange | null
  minDay: IsoDate
  maxDay: IsoDate
  /** The category's limit in days when one bike is being booked; null when booking by days. */
  maxDays: number | null
  mode: 'days' | 'bike'
  pending: boolean
  onChange: (range: DayRange) => void
}) {
  const [open, setOpen] = useState(range === null)
  const [selection, setSelection] = useState(() => rangeToSelection(range))
  const wide = useWideScreen()

  const base = useMemo(() => ({ units, minDay, maxDay, maxDays }), [units, minDay, maxDay, maxDays])
  // While only the first day is chosen the last one is limited by it (and by how far one bike can go).
  const pickContext: PickContext = { ...base, start: selection.start !== null && selection.end === null ? selection.start : null }

  function reasonText(day: IsoDate, reason: DayReason): string {
    const key = {
      past: 'off_past', too_far: 'off_far', closed: 'off_past', no_bike: mode === 'bike' ? 'off_no_bike_model' : 'off_no_bike', beyond_end: 'off_beyond',
    }[reason] as 'off_past' | 'off_far' | 'off_no_bike' | 'off_no_bike_model' | 'off_beyond'
    return fill(dict[key], { day: formatDay(day, lang) })
  }

  function tap(date: Date) {
    const next = pickDay(selection, isoDay(date))
    setSelection(next)
    const chosen = selectionToRange(next)
    if (chosen) {
      onChange(chosen)
      setOpen(false)
    }
  }

  if (range && !open) {
    const days = daysBetween(range.startsOn, range.endsOn)
    const before = shiftRange(range, -1)
    const after = shiftRange(range, 1)
    return (
      <div className="space-y-3 rounded-md border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground" aria-live="polite">
            <span className="font-semibold text-primary">{formatDays(range, lang, { weekday: true })}</span>
            {' · '}
            {days === 1 ? dict.days_one : fill(dict.days_other, { n: days })}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setSelection(rangeToSelection(range)); setOpen(true) }}>
            {dict.change_days}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending || !canBook(before, base)} onClick={() => onChange(before)}>
            <LuChevronLeft /> {dict.day_before}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || !canBook(after, base)} onClick={() => onChange(after)}>
            {dict.day_after} <LuChevronRight />
          </Button>
        </div>
      </div>
    )
  }

  const first = selection.start ? dayToDate(selection.start) : undefined
  const last = selection.end ? dayToDate(selection.end) : first

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Calendar
          mode="range"
          selected={first ? { from: first, to: last } : undefined}
          // The taps are handled by `onDayClick` (the stay is made by `pickDay`, not by the grid's own range rules).
          onSelect={() => {}}
          onDayClick={tap}
          numberOfMonths={wide ? 2 : 1}
          locale={CALENDAR_LOCALE[lang]}
          defaultMonth={first ?? dayToDate(minDay)}
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
          classNames={{ disabled: 'rounded-md bg-muted text-muted-foreground/60' }}
          className="mx-auto p-0 [--cell-size:2.25rem] sm:[--cell-size:2.5rem]"
        />
      </div>
      <p className="text-xs text-muted-foreground">{mode === 'bike' ? dict.legend_off_bike : dict.legend_off_days}</p>
      <p className="text-sm text-muted-foreground" aria-live="polite">{dict.dates_prompt}</p>
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
