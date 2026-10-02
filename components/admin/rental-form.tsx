'use client'
import { useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createRentalAction } from '@/lib/actions/reservations'
import { inclusiveEnd, isoDay } from '@/lib/dates'
import { rentalFeedback } from '@/lib/reservation-feedback'
import type { ReservationSummary } from '@/lib/reservations'
import type { ModelOption } from '@/components/admin/booking-types'

export function RentalForm({ models, onCreated }: { models: ModelOption[]; onCreated: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [modelId, setModelId] = useState('')
  const [sizeId, setSizeId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [range, setRange] = useState<DateRange | undefined>()
  const [label, setLabel] = useState('')
  // One key per form opening: a repeated submit (double click, network retry, back and resend)
  // finds the rental already saved instead of creating a second one.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const [duplicate, setDuplicate] = useState<ReservationSummary | null>(null)

  const selected = models.find((m) => m.model.id === modelId)
  const ready = Boolean(modelId && sizeId && versionId && range?.from && label.trim())

  function reset() {
    setModelId(''); setSizeId(''); setVersionId(''); setRange(undefined); setLabel('')
    setDuplicate(null)
    setRequestKey(crypto.randomUUID())
  }

  function submit(confirmDuplicate: boolean) {
    const first = range?.from
    if (!first) return
    startTransition(async () => {
      const result = await createRentalAction({
        requestKey, bikeModelId: modelId, bikeSizeId: sizeId, bikeVersionId: versionId,
        firstDay: isoDay(first), lastDay: isoDay(range.to ?? first),
        label, confirmDuplicate,
      })
      const feedback = rentalFeedback(result)
      if (feedback.tone === 'confirm-duplicate') {
        setDuplicate(feedback.existing)
        return
      }
      if (feedback.tone === 'success') {
        toast.success(feedback.message)
        reset()
        onCreated()
        return
      }
      toast.error(feedback.message)
    })
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (ready && !isPending) submit(false) }} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="rental-model">Model *</Label>
        <Select value={modelId} onValueChange={(id) => { setModelId(id); setSizeId(''); setVersionId('') }}>
          <SelectTrigger id="rental-model"><SelectValue placeholder="Choose a model" /></SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m.model.id} value={m.model.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rental-size">Size *</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger id="rental-size"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                {selected.allowedSizes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rental-version">Version *</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger id="rental-version"><SelectValue placeholder="Version" /></SelectTrigger>
              <SelectContent>
                {selected.allowedVersions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Days *</Label>
        <Calendar mode="range" selected={range} onSelect={setRange} className="mx-auto rounded-md border" />
        {range?.from && (
          <p className="text-xs text-muted-foreground">
            From {isoDay(range.from)} to {isoDay(range.to ?? range.from)} included
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="rental-name">Name *</Label>
        <Input id="rental-name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Who is renting" />
      </div>

      <Button type="submit" disabled={isPending || !ready}>Add rental</Button>

      <AlertDialog open={duplicate !== null} onOpenChange={(open) => { if (!open) setDuplicate(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Looks like a rental already entered</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicate && (
                <>A rental for &ldquo;{duplicate.label}&rdquo; already covers {duplicate.startsOn} to {inclusiveEnd(duplicate.endsOn)} for
                this kind of bike. Add another one anyway? It will take a second bike.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Do not add</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDuplicate(null); submit(true) }}>Add anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
