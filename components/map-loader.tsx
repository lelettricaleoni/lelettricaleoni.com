import { cn } from '@/lib/utils'
import { MapPin } from 'lucide-react'

export function MapLoader({ className }: { className?: string }) {
  return (
    <div className={cn('bg-muted flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <MapPin
          size={14}
          className="text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      </div>
      <p className="text-xs text-muted-foreground">Caricamento mappa…</p>
    </div>
  )
}
