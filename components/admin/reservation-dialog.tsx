'use client'
import { useEffect, useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  cancelReservationAction, getMoveCandidatesAction, getOccupiedRangesAction, moveReservationAction,
  updateMaintenanceAction,
} from '@/lib/actions/reservations'
import { occupiedDayRanges } from '@/lib/booking-grid'
import { dayToDate, inclusiveEnd, isoDay, type DayRange } from '@/lib/dates'
import { formatEuros } from '@/lib/money'
import { cancelFeedback, maintenanceUpdateFeedback, moveFeedback, type Feedback } from '@/lib/reservation-feedback'
import type { CustomerSummary } from '@/lib/customers'
import type { GridReservation, GridUnit, MoveCandidate } from '@/lib/reservations'

type Mode = 'view' | 'move' | 'edit'

export function ReservationDialog({
  unit, reservation, onClose,
}: { unit: GridUnit; reservation: GridReservation; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <Body key={reservation.id} unit={unit} reservation={reservation} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Shows the outcome of an action and says whether the dialog is done: a success or a stale
 * reservation (changed or removed by someone else) closes it, an error leaves it open.
 */
function report(feedback: Feedback): 'close' | 'stay' {
  if (feedback.tone === 'success') { toast.success(feedback.message); return 'close' }
  if (feedback.tone === 'stale') { toast.error(feedback.message); return 'close' }
  if (feedback.tone === 'error') toast.error(feedback.message)
  return 'stay'
}

function Body({ unit, reservation, onClose }: { unit: GridUnit; reservation: GridReservation; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>('view')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const isMaintenance = reservation.kind === 'maintenance'
  const lastDay = inclusiveEnd(reservation.endsOn)

  function cancel() {
    startTransition(async () => {
      const result = await cancelReservationAction({ id: reservation.id })
      if (report(cancelFeedback(result, isMaintenance ? 'maintenance' : 'rental')) === 'close') onClose()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isMaintenance ? 'Maintenance' : (reservation.label ?? 'Rental')}</DialogTitle>
        <DialogDescription>
          {unit.modelName} · {unit.sizeName} · {unit.versionName} · {unit.shortId}
          <br />
          {reservation.startsOn} to {lastDay} included
          {isMaintenance && reservation.label ? ` · ${reservation.label}` : ''}
        </DialogDescription>
      </DialogHeader>

      {reservation.customer && <CustomerDetails customer={reservation.customer} />}
      {reservation.amountCents !== null && (
        <p className="text-sm">Amount: <span className="font-medium">{formatEuros(reservation.amountCents)}</span></p>
      )}

      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {isMaintenance
            ? <Button variant="outline" onClick={() => setMode('edit')}>Change dates</Button>
            : <Button variant="outline" onClick={() => setMode('move')}>Move to another bike</Button>}
          <Button variant="destructive" disabled={isPending} onClick={() => setConfirmCancel(true)}>
            {isMaintenance ? 'Cancel maintenance' : 'Cancel rental'}
          </Button>
        </div>
      )}

      {mode === 'move' && <MovePicker reservationId={reservation.id} onBack={() => setMode('view')} onDone={onClose} />}

      {mode === 'edit' && (
        <EditMaintenance reservation={reservation} unitId={unit.id} onBack={() => setMode('view')} onDone={onClose} />
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isMaintenance ? 'Cancel this maintenance?' : 'Cancel this rental?'}</AlertDialogTitle>
            <AlertDialogDescription>The days become free again. The entry stays in the history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The person who rents: a tap on the phone or the email opens the call or the mail. */
function CustomerDetails({ customer }: { customer: CustomerSummary }) {
  if (!customer.phone && !customer.email && !customer.notes) return null
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      {customer.phone && <p><a className="text-[#366DA1] underline" href={`tel:${customer.phone}`}>{customer.phone}</a></p>}
      {customer.email && <p><a className="text-[#366DA1] underline" href={`mailto:${customer.email}`}>{customer.email}</a></p>}
      {customer.notes && <p className="whitespace-pre-line text-muted-foreground">{customer.notes}</p>}
    </div>
  )
}

function MovePicker({ reservationId, onBack, onDone }: { reservationId: string; onBack: () => void; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [candidates, setCandidates] = useState<MoveCandidate[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getMoveCandidatesAction({ id: reservationId }).then((list) => { if (!cancelled) setCandidates(list) })
    return () => { cancelled = true }
  }, [reservationId])

  function move(bikeUnitId: string) {
    startTransition(async () => {
      const result = await moveReservationAction({ id: reservationId, bikeUnitId })
      if (report(moveFeedback(result)) === 'close') onDone()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Free bikes on these days</p>
      {candidates === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {candidates?.length === 0 && <p className="text-sm text-muted-foreground">No other bike is free on these days.</p>}
      <ul className="space-y-1">
        {candidates?.map((c) => (
          <li key={c.bikeUnitId} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>
              {c.modelName} · {c.sizeName} · {c.versionName}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{c.shortId}</span>
              {c.sameModelAndSize && <span className="ml-2 text-xs text-[#366DA1]">same model and size</span>}
            </span>
            <Button size="sm" disabled={isPending} onClick={() => move(c.bikeUnitId)}>Move here</Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={onBack}>Back</Button>
    </div>
  )
}

function EditMaintenance({
  reservation, unitId, onBack, onDone,
}: { reservation: GridReservation; unitId: string; onBack: () => void; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [occupied, setOccupied] = useState<DayRange[]>([])
  const [range, setRange] = useState<DateRange | undefined>({
    from: dayToDate(reservation.startsOn), to: dayToDate(inclusiveEnd(reservation.endsOn)),
  })

  useEffect(() => {
    let cancelled = false
    getOccupiedRangesAction({ bikeUnitId: unitId, excludeId: reservation.id }).then((r) => { if (!cancelled) setOccupied(r) })
    return () => { cancelled = true }
  }, [unitId, reservation.id])

  function save() {
    const first = range?.from
    if (!first) return
    startTransition(async () => {
      const result = await updateMaintenanceAction({
        id: reservation.id, firstDay: isoDay(first), lastDay: isoDay(range.to ?? first),
      })
      if (report(maintenanceUpdateFeedback(result)) === 'close') onDone()
    })
  }

  return (
    <div className="space-y-3">
      <Calendar
        mode="range" selected={range} onSelect={setRange} defaultMonth={range?.from}
        disabled={occupiedDayRanges(occupied)} excludeDisabled className="mx-auto rounded-md border"
      />
      <div className="flex gap-2">
        <Button disabled={isPending || !range?.from} onClick={save}>Save dates</Button>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </div>
    </div>
  )
}
