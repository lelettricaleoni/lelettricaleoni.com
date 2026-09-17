'use client'
import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { deleteBikeUnitAction } from '@/lib/actions/bike-units'
import type { BikeUnit } from '@/lib/db'

interface UnitRow {
  unit: BikeUnit
  modelName: string | null
  sizeName: string
  versionName: string
}

export function BikeUnitList({ units }: { units: UnitRow[] }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteBikeUnitAction(id)
      toast.success('Bike removed from the shop')
    })
  }

  if (units.length === 0) {
    return <p className="text-muted-foreground text-sm">No bikes in the shop yet.</p>
  }

  return (
    <div className="space-y-2">
      {units.map(({ unit, modelName, sizeName, versionName }) => (
        <div key={unit.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
          <div className="space-y-0.5">
            <p className="font-mono text-xs text-muted-foreground">{unit.id.slice(0, 8)}</p>
            <p className="text-sm font-medium">{modelName ?? 'Untitled'}</p>
            <p className="text-xs text-muted-foreground">{sizeName} · {versionName}</p>
          </div>
          <Button
            size="icon" variant="ghost" className="text-destructive"
            disabled={isPending}
            onClick={() => handleDelete(unit.id)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
    </div>
  )
}
