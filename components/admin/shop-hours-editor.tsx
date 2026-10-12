'use client'

import { useState, useTransition } from 'react'
import { LuPlus, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { addClosureAction, removeClosureAction, saveOpeningHoursAction } from '@/lib/actions/shop-hours'
import { rethrowIfStaleAction } from '@/lib/stale-action'
import type { Closure } from '@/lib/shop-schedule-data'
import type { HoursRange } from '@/lib/shop-schedule'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const NEW_RANGE: HoursRange = { opensAt: '09:00', closesAt: '19:00' }

/**
 * The opening hours of the week and the days the shop is closed. The booking page follows them: a closed day cannot be the first or the last
 * day of a stay, and the customer is told the hours of the pickup and return days. The counter (Bookings) is never limited by them.
 */
export function ShopHoursEditor({ week, closures }: { week: HoursRange[][]; closures: Closure[] }) {
  return (
    <div className="space-y-6">
      <WeekCard initial={week} />
      <ClosuresCard closures={closures} />
    </div>
  )
}

function WeekCard({ initial }: { initial: HoursRange[][] }) {
  const [days, setDays] = useState<HoursRange[][]>(initial)
  const [pending, startSave] = useTransition()

  const setRanges = (index: number, ranges: HoursRange[]) => setDays((current) => current.map((day, i) => (i === index ? ranges : day)))
  const setField = (index: number, rangeIndex: number, field: keyof HoursRange, value: string) =>
    setRanges(index, days[index].map((range, i) => (i === rangeIndex ? { ...range, [field]: value } : range)))

  function save() {
    startSave(async () => {
      try {
        const result = await saveOpeningHoursAction({ days })
        if (result.status === 'saved') toast.success('Opening hours saved')
        else toast.error(result.message)
      } catch (error) {
        rethrowIfStaleAction(error)
        toast.error('Could not save the hours. Try again.')
      }
    })
  }

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="hours-week">
      <h2 id="hours-week" className="text-lg font-semibold text-foreground">Opening hours</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Two ranges in a day are the lunch break. A closed day cannot be the first or the last day of an online booking.
      </p>
      <div className="mt-4 divide-y">
        {WEEKDAYS.map((name, index) => {
          const ranges = days[index]
          const open = ranges.length > 0
          return (
            <div key={name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-6">
              <label className="flex w-40 shrink-0 items-center gap-3 text-sm font-medium text-foreground sm:pt-1.5">
                <Switch
                  checked={open}
                  onCheckedChange={(checked) => setRanges(index, checked ? [{ ...NEW_RANGE }] : [])}
                  aria-label={`${name} is open`}
                />
                {name}
              </label>
              <div className="flex-1 space-y-2">
                {!open && <p className="text-sm text-muted-foreground sm:pt-1.5">Closed</p>}
                {ranges.map((range, rangeIndex) => (
                  <div key={rangeIndex} className="flex items-center gap-2">
                    <Input
                      type="time" value={range.opensAt} className="h-9 w-32" aria-label={`${name}, opens`}
                      onChange={(event) => setField(index, rangeIndex, 'opensAt', event.target.value)}
                    />
                    <span className="text-muted-foreground" aria-hidden>–</span>
                    <Input
                      type="time" value={range.closesAt} className="h-9 w-32" aria-label={`${name}, closes`}
                      onChange={(event) => setField(index, rangeIndex, 'closesAt', event.target.value)}
                    />
                    <Button
                      type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remove this range on ${name}`}
                      onClick={() => setRanges(index, ranges.filter((_, i) => i !== rangeIndex))}
                    >
                      <LuTrash2 size={14} />
                    </Button>
                  </div>
                ))}
                {open && ranges.length < 6 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRanges(index, [...ranges, { ...NEW_RANGE }])}>
                    <LuPlus /> Add range
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Button type="button" className="mt-4" disabled={pending} onClick={save}>Save hours</Button>
    </section>
  )
}

function ClosuresCard({ closures }: { closures: Closure[] }) {
  const [pending, startChange] = useTransition()
  const [startsOn, setStartsOn] = useState('')
  const [lastDay, setLastDay] = useState('')
  const [reason, setReason] = useState('')

  function add() {
    startChange(async () => {
      try {
        // One day is a closure whose last day is the first.
        const result = await addClosureAction({ startsOn, lastDay: lastDay || startsOn, reason })
        if (result.status === 'added') {
          toast.success('Closure added')
          setStartsOn('')
          setLastDay('')
          setReason('')
        } else {
          toast.error(result.message)
        }
      } catch (error) {
        rethrowIfStaleAction(error)
        toast.error('Could not add the closure. Try again.')
      }
    })
  }

  function remove(id: string) {
    startChange(async () => {
      try {
        await removeClosureAction(id)
        toast.success('Closure removed')
      } catch (error) {
        rethrowIfStaleAction(error)
        toast.error('Could not remove the closure. Try again.')
      }
    })
  }

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="hours-closures">
      <h2 id="hours-closures" className="text-lg font-semibold text-foreground">Closures</h2>
      <p className="mt-1 text-sm text-muted-foreground">Holidays and days away. The reason is only for you: customers do not see it.</p>
      <ul className="mt-4 divide-y">
        {closures.length === 0 && <li className="py-2 text-sm text-muted-foreground">No closure planned.</li>}
        {closures.map((closure) => (
          <li key={closure.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-medium tabular-nums text-foreground">
              {closure.startsOn === closure.lastDay ? closure.startsOn : `${closure.startsOn} → ${closure.lastDay}`}
            </span>
            <span className="flex-1 text-muted-foreground">{closure.reason}</span>
            <Button
              type="button" size="icon" variant="ghost" className="text-destructive" disabled={pending}
              aria-label={`Remove the closure from ${closure.startsOn}`} onClick={() => remove(closure.id)}
            >
              <LuTrash2 size={14} />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
        onSubmit={(event) => { event.preventDefault(); add() }}
      >
        <label className="space-y-1 text-sm font-medium text-foreground">
          First day
          <Input type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="h-9 w-40" />
        </label>
        <label className="space-y-1 text-sm font-medium text-foreground">
          Last day
          <Input type="date" value={lastDay} min={startsOn || undefined} onChange={(event) => setLastDay(event.target.value)} className="h-9 w-40" />
        </label>
        <label className="min-w-40 flex-1 space-y-1 text-sm font-medium text-foreground">
          Reason
          <Input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Optional" className="h-9" />
        </label>
        <Button type="submit" variant="outline" disabled={pending || !startsOn}>
          <LuPlus /> Add closure
        </Button>
      </form>
    </section>
  )
}
