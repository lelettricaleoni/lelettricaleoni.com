'use client'
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { layoutBlocks } from '@/lib/booking-grid'
import { coalesce } from '@/lib/coalesce'
import {
  dayOfMonth, isWeekendDay, monthDays, monthTitle, shiftMonth, weekdayLetter, type IsoDate, type IsoMonth,
} from '@/lib/dates'
import type { GridReservation, GridUnit } from '@/lib/reservations'
import type { ModelOption } from '@/components/admin/booking-types'
import { useReservationsRealtime } from '@/components/admin/use-reservations-realtime'
import { RentalForm } from '@/components/admin/rental-form'
import { MaintenanceForm } from '@/components/admin/maintenance-form'
import { ReservationDialog } from '@/components/admin/reservation-dialog'

interface BookingViewProps {
  month: IsoMonth
  today: IsoDate
  units: GridUnit[]
  models: ModelOption[]
}

const LABEL_COLUMN = 'minmax(11rem, 14rem)'

export function BookingView({ month, today, units, models }: BookingViewProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rentalOpen, setRentalOpen] = useState(false)
  const [selected, setSelected] = useState<{ unit: GridUnit; reservation: GridReservation } | null>(null)
  const [maintenanceUnit, setMaintenanceUnit] = useState<GridUnit | null>(null)
  const days = monthDays(month)

  // router.refresh() re-runs this page's server component: the ping carries nothing to trust,
  // so the grid is simply read again. One reload per quarter of a second at most: a save asks
  // for one and the ping it causes arrives a moment later (one reload, not two), and the public
  // channel cannot be used to make this page reload in a loop.
  const reload = useMemo(
    () => coalesce(() => startTransition(() => router.refresh()), 250),
    [router, startTransition],
  )
  useEffect(() => () => reload.cancel(), [reload])
  useReservationsRealtime(reload)

  const columns = `${LABEL_COLUMN} repeat(${days.length}, minmax(2rem, 1fr))`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Bookings</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRentalOpen(true)}><Plus size={16} className="mr-1" />New rental</Button>
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, -1)}`}><ChevronLeft size={16} /></Link>
          </Button>
          <span className="min-w-36 text-center font-medium">{monthTitle(month)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/manage/bookings?month=${shiftMonth(month, 1)}`}><ChevronRight size={16} /></Link>
          </Button>
        </div>
      </div>

      <Legend />

      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bikes in the shop yet. Add them in Shop first.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div className="grid min-w-max" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 z-10 border-b bg-card p-2 text-xs font-medium text-muted-foreground">Bike</div>
            {days.map((day) => (
              <div
                key={day}
                className={cn(
                  'border-b border-l p-1 text-center text-[10px] leading-tight text-muted-foreground',
                  isWeekendDay(day) && 'bg-muted/50',
                  day === today && 'bg-[#366DA1]/15 font-semibold text-foreground',
                )}
              >
                <div>{weekdayLetter(day)}</div>
                <div className="text-xs">{dayOfMonth(day)}</div>
              </div>
            ))}

            {units.map((unit, index) => (
              <Fragment key={unit.id}>
                {(index === 0 || units[index - 1].modelName !== unit.modelName) && (
                  <div className="col-span-full border-b bg-muted/40 px-2 py-1 text-xs font-semibold text-[#1e3a5f]">
                    {unit.modelName}
                  </div>
                )}
                <UnitRow
                  unit={unit} month={month} days={days} today={today}
                  onSelect={(reservation) => setSelected({ unit, reservation })}
                  onPlanMaintenance={() => setMaintenanceUnit(unit)}
                />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <Dialog open={rentalOpen} onOpenChange={setRentalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New rental</DialogTitle></DialogHeader>
          <RentalForm models={models} onCreated={() => { setRentalOpen(false); reload() }} />
        </DialogContent>
      </Dialog>

      {selected && (
        <ReservationDialog unit={selected.unit} reservation={selected.reservation} onClose={() => { setSelected(null); reload() }} />
      )}

      <Dialog open={maintenanceUnit !== null} onOpenChange={(open) => { if (!open) setMaintenanceUnit(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Plan maintenance</DialogTitle></DialogHeader>
          {maintenanceUnit && (
            <MaintenanceForm unit={maintenanceUnit} onPlanned={() => { setMaintenanceUnit(null); reload() }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-[#366DA1]" />Rental</span>
      <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-amber-300" />Maintenance</span>
    </div>
  )
}

interface UnitRowProps {
  unit: GridUnit
  month: IsoMonth
  days: IsoDate[]
  today: IsoDate
  onSelect: (reservation: GridReservation) => void
  onPlanMaintenance: () => void
}

function UnitRow({ unit, month, days, today, onSelect, onPlanMaintenance }: UnitRowProps) {
  const blocks = layoutBlocks(month, unit.reservations)
  const byId = new Map(unit.reservations.map((reservation) => [reservation.id, reservation]))

  return (
    <>
      <div className="sticky left-0 z-10 flex items-center justify-between border-b bg-card px-2 py-1">
        <div className="flex flex-col justify-center">
          <span className="font-mono text-[10px] text-muted-foreground">{unit.shortId}</span>
          <span className="text-xs">{unit.sizeName} · {unit.versionName}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Plan maintenance" onClick={onPlanMaintenance}>
          <Wrench size={14} />
        </Button>
      </div>
      <div
        className="relative grid min-h-10 border-b"
        style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(2rem, 1fr))` }}
      >
        {days.map((day, i) => (
          <div
            key={day}
            className={cn('border-l', isWeekendDay(day) && 'bg-muted/50', day === today && 'bg-[#366DA1]/10')}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          />
        ))}
        {blocks.map((block) => (
          <button
            type="button"
            key={block.reservationId}
            onClick={() => onSelect(byId.get(block.reservationId)!)}
            title={block.label ?? undefined}
            className={cn(
              'z-[1] my-1 cursor-pointer truncate px-1.5 text-left text-xs leading-7',
              block.kind === 'maintenance' ? 'bg-amber-300 text-amber-950' : 'bg-[#366DA1] text-white',
              block.clippedStart ? 'rounded-l-none' : 'rounded-l-md',
              block.clippedEnd ? 'rounded-r-none' : 'rounded-r-md',
            )}
            style={{ gridColumn: `${block.startColumn} / span ${block.span}`, gridRow: 1 }}
          >
            {block.label ?? (block.kind === 'maintenance' ? 'Maintenance' : '')}
          </button>
        ))}
      </div>
    </>
  )
}
