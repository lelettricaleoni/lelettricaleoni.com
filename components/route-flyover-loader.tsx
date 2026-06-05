'use client'
import dynamic from 'next/dynamic'
import { MapLoader } from '@/components/map-loader'

type FlyoverProps = { points: [number, number, number][]; difficulty?: string }

const Flyover = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  { ssr: false, loading: () => <MapLoader className="h-72 sm:h-[420px] rounded-xl" /> }
)

export function RouteFlyoverLoader({ points, difficulty }: FlyoverProps) {
  return <Flyover points={points} difficulty={difficulty} />
}
