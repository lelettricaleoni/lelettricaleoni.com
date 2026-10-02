'use client'
import { useEffect, useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getOccupiedRangesAction, planMaintenanceAction } from '@/lib/actions/reservations'
import { occupiedDayRanges } from '@/lib/booking-grid'
import { isoDay, type DayRange } from '@/lib/dates'
import { maintenancePlanFeedback } from '@/lib/reservation-feedback'
import type { GridUnit } from '@/lib/reservations'

export function MaintenanceForm({ unit, onPlanned }: { unit: GridUnit; onPlanned: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [occupied, setOccupied] = useState<DayRange[]>([])
  const [range, setRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState('')
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    getOccupiedRangesAction({ bikeUnitId: unit.id }).then((ranges) => { if (!cancelled) setOccupied(ranges) })
    return () => { cancelled = true }
  }, [unit.id])

  function submit() {
    const first = range?.from
    if (!first) return
    startTransition(async () => {
      const result = await planMaintenanceAction({
        requestKey, bikeUnitId: unit.id,
        firstDay: isoDay(first), lastDay: isoDay(range.to ?? first),
        label: reason,
      })
      const feedback = maintenancePlanFeedback(result)
      if (feedback.tone === 'success') {
        toast.success(feedback.message)
        setRequestKey(crypto.randomUUID())
        onPlanned()
        return
      }
      if (feedback.tone === 'error') toast.error(feedback.message)
    })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (range?.from && !isPending) submit() }} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {unit.modelName} · {unit.sizeName} · {unit.versionName}
        <span className="ml-2 font-mono text-xs">{unit.shortId}</span>
      </p>
      <div className="space-y-1">
        <Label>From and to *</Label>
        {/* Days this bike is already booked are disabled, and a range cannot cross them. */}
        <Calendar
          mode="range" selected={range} onSelect={setRange}
          disabled={occupiedDayRanges(occupied)} excludeDisabled
          className="mx-auto rounded-md border"
        />
        {range?.from && (
          <p className="text-xs text-muted-foreground">
            From {isoDay(range.from)} to {isoDay(range.to ?? range.from)} included
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="maintenance-reason">Reason</Label>
        <Input id="maintenance-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="Optional" />
      </div>
      <Button type="submit" disabled={isPending || !range?.from}>Plan maintenance</Button>
    </form>
  )
}
