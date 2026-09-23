'use client'
import dynamic from 'next/dynamic'
import { MapLoader } from '@/components/map-loader'

type FlyoverLabels = { toggle: string; altitude: string; distance: string; duration: string; speed: string }
type FlyoverProps = {
  points: [number, number, number][]
  difficulty?: string
  labels: FlyoverLabels
  totalDistanceKm?: number
  totalDurationMin?: number | null
}

const Flyover = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  { ssr: false, loading: () => <MapLoader className="h-72 sm:h-[420px] rounded-xl" /> }
)

export function RouteFlyoverLoader({ points, difficulty, labels, totalDistanceKm, totalDurationMin }: FlyoverProps) {
  return (
    <Flyover
      points={points}
      difficulty={difficulty}
      labels={labels}
      totalDistanceKm={totalDistanceKm}
      totalDurationMin={totalDurationMin}
    />
  )
}
