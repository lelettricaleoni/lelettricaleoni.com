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
  cancelOnlineAction, cancelReservationAction, getMoveCandidatesAction, getOccupiedRangesAction, moveReservationAction,
  updateMaintenanceAction,
} from '@/lib/actions/reservations'
import { occupiedDayRanges } from '@/lib/booking-grid'
import { dayToDate, inclusiveEnd, isoDay, type DayRange } from '@/lib/dates'
import { formatEuros } from '@/lib/money'
import { cancelFeedback, cancelOnlineFeedback, maintenanceUpdateFeedback, moveFeedback, type Feedback } from '@/lib/reservation-feedback'
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
  const isOnline = reservation.kind === 'online_rental'
  const held = reservation.status === 'held'
  const [refunding, setRefunding] = useState(false)
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
        <DialogTitle>{isMaintenance ? 'Maintenance' : (reservation.label ?? (isOnline ? 'Online booking' : 'Rental'))}</DialogTitle>
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

      {isOnline && (
        <p className="text-sm text-muted-foreground">
          {held
            ? 'Being paid: the bike is held until the customer pays or the time runs out.'
            : 'Booked and paid on the site. Cancelling it gives money back.'}
        </p>
      )}

      {mode === 'view' && isOnline && (
        <div className="flex flex-wrap gap-2">
          {!held && <Button variant="destructive" disabled={isPending} onClick={() => setRefunding(true)}>Cancel and refund…</Button>}
        </div>
      )}

      {mode === 'view' && !isOnline && (
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

      {isOnline && <RefundDialog reservation={reservation} open={refunding} onOpenChange={setRefunding} onDone={onClose} />}

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

/**
 * Cancelling a bike booked online: how much goes back to the customer (all of it, part of it, none) is the shop's call, at any time.
 * The answer is a toast; the dialog closes when it worked, and stays open when the refund failed (the bike is still booked then).
 */
function RefundDialog({
  reservation, open, onOpenChange, onDone,
}: { reservation: GridReservation; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [choice, setChoice] = useState<'full' | 'partial' | 'none'>('full')
  const [amount, setAmount] = useState('')
  const [pending, startTransition] = useTransition()
  const price = reservation.amountCents ?? 0

  function submit() {
    startTransition(async () => {
      const input = choice === 'partial'
        ? { id: reservation.id, refund: 'partial' as const, amount: Number(amount.replace(',', '.')) }
        : { id: reservation.id, refund: choice }
      const result = await cancelOnlineAction(input)
      if (report(cancelOnlineFeedback(result)) === 'close') onDone()
    })
  }

  const options = [
    { value: 'full' as const, label: `Refund in full (${formatEuros(price)})` },
    { value: 'partial' as const, label: 'Refund part of it' },
    { value: 'none' as const, label: 'No refund' },
  ]

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this bike and refund?</AlertDialogTitle>
          <AlertDialogDescription>The days become free again. The refund goes back to the card the customer paid with.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="refund" value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} />
              {option.label}
            </label>
          ))}
          {choice === 'partial' && (
            <div className="flex items-center gap-2 pl-6">
              <input
                inputMode="decimal" aria-label="Amount to refund, in euros" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="h-9 w-28 rounded-md border bg-background px-3 text-sm"
              />
              <span className="text-sm text-muted-foreground">€ of {formatEuros(price)}</span>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); submit() }}>Cancel it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
