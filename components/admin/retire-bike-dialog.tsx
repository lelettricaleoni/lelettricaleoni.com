'use client'
import { useState, useTransition } from 'react'
import { PackageX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { retireBikeUnitAction } from '@/lib/actions/bike-units'
import { dayToDate, isoDay, type IsoDate } from '@/lib/dates'
import { retireFeedback } from '@/lib/reservation-feedback'

/**
 * Takes a bike out of the shop's offer from a day on (sold, retired). Not a deletion: its
 * reservations stay as the history, and until that day it can still be rented.
 */
export function RetireBikeDialog({ unitId, label, today }: { unitId: string; label: string; today: IsoDate }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [day, setDay] = useState<Date | undefined>(() => dayToDate(today))

  function retire() {
    if (!day) return
    const retiredOn = isoDay(day)
    startTransition(async () => {
      const feedback = retireFeedback(await retireBikeUnitAction({ id: unitId, retiredOn }), retiredOn)
      if (feedback.tone === 'success') {
        toast.success(feedback.message)
        setOpen(false)
      } else if (feedback.tone === 'stale') {
        toast.error(feedback.message)
        setOpen(false)
      } else if (feedback.tone === 'error') {
        toast.error(feedback.message)
      }
    })
  }

  return (
    <>
      <Button size="icon" variant="ghost" aria-label="Retire bike" disabled={isPending} onClick={() => setOpen(true)}>
        <PackageX size={14} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retire this bike</DialogTitle>
            <DialogDescription>
              {label}. From the day you pick it is no longer offered; until then it can still be rented. Its past
              rentals stay in the history. If it is still booked from that day on, you will be told which rentals to
              move first.
            </DialogDescription>
          </DialogHeader>
          <Calendar mode="single" selected={day} onSelect={setDay} defaultMonth={day} className="rounded-md border" />
          <p className="text-xs text-muted-foreground">
            {day ? `Not offered from ${isoDay(day)}` : 'Pick the first day it is no longer offered'}
          </p>
          <Button disabled={isPending || !day} onClick={retire}>Retire bike</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
