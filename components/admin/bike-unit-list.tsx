'use client'
import { useTransition } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { deleteBikeUnitAction, restoreBikeUnitAction } from '@/lib/actions/bike-units'
import { inclusiveEnd } from '@/lib/dates'
import { deleteBikeFeedback, restoreFeedback } from '@/lib/reservation-feedback'
import { RetireBikeDialog } from '@/components/admin/retire-bike-dialog'
import type { BikeUnit } from '@/lib/db'
import type { IsoDate } from '@/lib/dates'
import type { MaintenanceInfo } from '@/lib/reservations'

interface UnitRow {
  unit: BikeUnit
  modelName: string | null
  sizeName: string
  versionName: string
}

export function BikeUnitList({
  units, maintenance, today,
}: { units: UnitRow[]; maintenance: Record<string, MaintenanceInfo>; today: IsoDate }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      const feedback = deleteBikeFeedback(await deleteBikeUnitAction(id))
      if (feedback.tone === 'success') toast.success(feedback.message)
      else if (feedback.tone === 'error') toast.error(feedback.message)
    })
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      const feedback = restoreFeedback(await restoreBikeUnitAction({ id }))
      if (feedback.tone === 'success') toast.success(feedback.message)
      else if (feedback.tone === 'stale' || feedback.tone === 'error') toast.error(feedback.message)
    })
  }

  if (units.length === 0) {
    return <p className="text-muted-foreground text-sm">No bikes in the shop yet.</p>
  }

  return (
    <div className="space-y-2">
      {units.map(({ unit, modelName, sizeName, versionName }) => {
        const block = maintenance[unit.id]
        return (
          <div key={unit.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
            <div className="space-y-0.5">
              <p className="font-mono text-xs text-muted-foreground">{unit.id.slice(0, 8)}</p>
              <p className="text-sm font-medium">{modelName ?? 'Untitled'}</p>
              <p className="text-xs text-muted-foreground">{sizeName} · {versionName}</p>
              {unit.retiredOn && (
                <p className="text-xs font-medium text-amber-700">Retired from {unit.retiredOn}</p>
              )}
              {block && (
                <p className="text-xs font-medium text-amber-700">
                  {block.active
                    ? `Maintenance until ${inclusiveEnd(block.endsOn)}`
                    : `Maintenance from ${block.startsOn}`}
                </p>
              )}
            </div>
            <div className="flex items-center">
              {unit.retiredOn ? (
                <Button
                  size="icon" variant="ghost" aria-label="Bring back into service"
                  disabled={isPending}
                  onClick={() => handleRestore(unit.id)}
                >
                  <RotateCcw size={14} />
                </Button>
              ) : (
                <RetireBikeDialog
                  unitId={unit.id} today={today}
                  label={`${modelName ?? 'Untitled'} · ${sizeName} · ${versionName} · ${unit.id.slice(0, 8)}`}
                />
              )}
              <Button
                size="icon" variant="ghost" className="text-destructive"
                disabled={isPending}
                onClick={() => handleDelete(unit.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
