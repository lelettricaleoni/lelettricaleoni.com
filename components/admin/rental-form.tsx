'use client'
import { useMemo, useState, useTransition } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CustomerPicker } from '@/components/admin/customer-picker'
import { SearchSelect } from '@/components/admin/search-select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createRentalAction } from '@/lib/actions/reservations'
import { fullName } from '@/lib/customer'
import { daysBetween, inclusiveEnd, isoDay } from '@/lib/dates'
import { formatEuros, toCents } from '@/lib/money'
import { rentalFeedback } from '@/lib/reservation-feedback'
import { listPrice, onlyChoice, sizesOf, versionsOf, type RentalOption } from '@/lib/rental-options'
import type { CustomerSummary } from '@/lib/customers'
import type { ReservationSummary } from '@/lib/reservations'

/** The chosen size or version: the site blue, so it cannot be mistaken for the hover. */
const CHOSEN = 'data-[state=on]:bg-[#366DA1] data-[state=on]:text-white data-[state=on]:hover:bg-[#2f5f8d]'

/**
 * Two columns on a wide screen (the bike and the days on the left, who rents and the summary on
 * the right), one on a phone. `models` are the models, sizes and versions of the bikes really in
 * the shop (not the ones a model is allowed to have on paper): each choice narrows the next, and a
 * choice with a single possibility is made for the person.
 */
export interface FixedBike { unitId: string; modelId: string; sizeId: string; versionId: string; label: string }

/**
 * With `bike` the rental is for that very bike (opened from its own row in the calendar): the model,
 * size and version are not asked, and no other bike of the kind will be given.
 */
export function RentalForm({
  models, bike = null, onCreated,
}: { models: RentalOption[]; bike?: FixedBike | null; onCreated: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [modelId, setModelId] = useState(bike?.modelId ?? '')
  const [sizeId, setSizeId] = useState(bike?.sizeId ?? '')
  const [versionId, setVersionId] = useState(bike?.versionId ?? '')
  const [range, setRange] = useState<DateRange | undefined>()
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  // The amount follows the list price until the person types one: then it is theirs (a discount, an extra).
  const [typedAmount, setTypedAmount] = useState<string | null>(null)
  // One key per form opening: a repeated submit (double click, network retry, back and resend)
  // finds the rental already saved instead of creating a second one.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID())
  const [duplicate, setDuplicate] = useState<ReservationSummary | null>(null)

  const modelOptions = useMemo(
    () => models.map((model) => ({ value: model.modelId, label: model.modelName })),
    [models],
  )
  const sizes = sizesOf(models, modelId)
  const versions = versionsOf(models, modelId, sizeId)
  const firstDay = range?.from ? isoDay(range.from) : null
  const lastDay = range?.from ? isoDay(range.to ?? range.from) : null
  const dayCount = firstDay && lastDay ? daysBetween(firstDay, lastDay) + 1 : 0
  const suggested = listPrice(models, modelId, dayCount)
  const amountText = typedAmount ?? (suggested === null ? '' : String(suggested))
  // The browser hands a type="number" field a plain decimal ("12.5"), whatever the locale shows.
  const amount = amountText.trim() === '' ? null : Number(amountText)
  const amountValid = amount !== null && Number.isFinite(amount) && amount >= 0
  const ready = Boolean(modelId && sizeId && versionId && range?.from && customer && amountValid)

  function chooseModel(id: string) {
    const nextSize = onlyChoice(sizesOf(models, id))
    setModelId(id)
    setSizeId(nextSize)
    setVersionId(onlyChoice(versionsOf(models, id, nextSize)))
  }

  function chooseSize(id: string) {
    setSizeId(id)
    setVersionId(onlyChoice(versionsOf(models, modelId, id)))
  }

  function reset() {
    setModelId(bike?.modelId ?? ''); setSizeId(bike?.sizeId ?? ''); setVersionId(bike?.versionId ?? '')
    setRange(undefined); setCustomer(null); setTypedAmount(null)
    setDuplicate(null)
    setRequestKey(crypto.randomUUID())
  }

  function submit(confirmDuplicate: boolean) {
    const first = range?.from
    if (!first || !customer || amount === null || !amountValid) return
    startTransition(async () => {
      const result = await createRentalAction({
        requestKey, bikeModelId: modelId, bikeSizeId: sizeId, bikeVersionId: versionId,
        firstDay: isoDay(first), lastDay: isoDay(range.to ?? first),
        customerId: customer.id, bikeUnitId: bike?.unitId, amount, confirmDuplicate,
      })
      const feedback = rentalFeedback(result, { specificBike: bike !== null })
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

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">There are no bikes in the shop yet. Add them in Shop first.</p>
  }

  const modelName = models.find((model) => model.modelId === modelId)?.modelName
  const sizeName = sizes.find((size) => size.id === sizeId)?.name
  const versionName = versions.find((version) => version.id === versionId)?.name

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); if (ready && !isPending) submit(false) }}
      className="grid gap-6 md:grid-cols-2"
    >
      <div className="space-y-5">
        {bike ? (
          <div className="space-y-1">
            <Label>Bike</Label>
            <p className="rounded-md border bg-muted/40 p-3 text-sm font-medium">{bike.label}</p>
          </div>
        ) : (
          <>
          <div className="space-y-1">
            <Label htmlFor="rental-model">Model *</Label>
            <SearchSelect
              id="rental-model" options={modelOptions} value={modelId} onChange={chooseModel}
              placeholder="Choose a model" searchPlaceholder="Search model" emptyText="No model found."
              className="w-full"
            />
          </div>

          {modelId && (
            <div className="space-y-1">
              <Label id="rental-size-label">Size *</Label>
              <ToggleGroup
                type="single" variant="outline" value={sizeId} aria-labelledby="rental-size-label"
                onValueChange={(id) => { if (id) chooseSize(id) }} className="flex-wrap justify-start"
              >
                {sizes.map((size) => <ToggleGroupItem key={size.id} value={size.id} className={CHOSEN}>{size.name}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          )}

          {sizeId && (
            <div className="space-y-1">
              <Label id="rental-version-label">Version *</Label>
              <ToggleGroup
                type="single" variant="outline" value={versionId} aria-labelledby="rental-version-label"
                onValueChange={(id) => { if (id) setVersionId(id) }} className="flex-wrap justify-start"
              >
                {versions.map((version) => <ToggleGroupItem key={version.id} value={version.id} className={CHOSEN}>{version.name}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          )}
          </>
        )}

        <div className="space-y-1">
          <Label>Days *</Label>
          <Calendar mode="range" selected={range} onSelect={setRange} className="mx-auto rounded-md border" />
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-1">
          <Label>Customer *</Label>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rental-amount">Amount (€) *</Label>
          <Input
            id="rental-amount" type="number" inputMode="decimal" min={0} step="0.01"
            value={amountText} onChange={(event) => setTypedAmount(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {dayCount === 0 && (bike ? 'Pick the days to see the list price.' : 'Pick the bike and the days to see the list price.')}
            {dayCount > 0 && suggested !== null && `List price for ${dayCount} ${dayCount === 1 ? 'day' : 'days'}: ${formatEuros(toCents(suggested))}.`}
            {dayCount > 0 && suggested === null && 'The list has no price for these days: type the amount.'}
            {typedAmount !== null && suggested !== null && toCents(Number(typedAmount)) !== toCents(suggested) && (
              <>{' '}<button type="button" className="underline" onClick={() => setTypedAmount(null)}>Use the list price</button></>
            )}
          </p>
        </div>

        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm" aria-live="polite">
          <p className="font-medium">Summary</p>
          <p className="text-muted-foreground">
            {modelName ? [modelName, sizeName, versionName].filter(Boolean).join(' · ') : 'No bike chosen yet'}
          </p>
          <p className="text-muted-foreground">
            {firstDay && lastDay
              ? `${firstDay} to ${lastDay} included · ${dayCount} ${dayCount === 1 ? 'day' : 'days'}`
              : 'No days chosen yet'}
          </p>
          <p className="text-muted-foreground">
            {customer ? fullName(customer.firstName, customer.lastName) : 'No customer chosen yet'}
          </p>
          <p className="text-muted-foreground">
            {amountValid ? formatEuros(toCents(amount)) : 'No amount yet'}
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={isPending || !ready}>Add rental</Button>
      </div>

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
