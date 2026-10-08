import { LuMountain, LuRoute, LuLayers, LuBuilding2 } from 'react-icons/lu'
import type { IconType } from 'react-icons'

const BIKE_ICONS: Record<string, IconType> = {
  'eMTB':        LuMountain,
  'MTB':         LuMountain,
  'Road Bike':   LuRoute,
  'E-Road Bike': LuRoute,
  'Gravel':      LuLayers,
  'E-Gravel':    LuLayers,
  'City Bike':   LuBuilding2,
  'E-City Bike': LuBuilding2,
}

export function bikeTypeBadgeClass(_type: string): string {
  return 'bg-muted/50 border-border'
}

export function BikeTypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  const Icon = BIKE_ICONS[type] ?? LuRoute
  return <Icon size={size} className="shrink-0 text-muted-foreground" />
}
