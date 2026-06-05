import { Mountain, Route, Layers, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const BIKE_ICONS: Record<string, LucideIcon> = {
  'eMTB':        Mountain,
  'MTB':         Mountain,
  'Road Bike':   Route,
  'E-Road Bike': Route,
  'Gravel':      Layers,
  'E-Gravel':    Layers,
  'City Bike':   Building2,
  'E-City Bike': Building2,
}

export function bikeTypeBadgeClass(_type: string): string {
  return 'bg-muted/50 border-border'
}

export function BikeTypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  const Icon = BIKE_ICONS[type] ?? Route
  return <Icon size={size} className="shrink-0 text-muted-foreground" />
}
