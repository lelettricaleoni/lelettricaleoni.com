'use client'
import dynamic from 'next/dynamic'

const RouteMapInner = dynamic(
  () => import('@/components/route-map').then((m) => m.RouteMap),
  {
    ssr: false,
    loading: () => <div className="h-72 sm:h-96 rounded-xl bg-muted animate-pulse" />,
  }
)

interface Props {
  points: [number, number][]
}

export function RouteMapLoader({ points }: Props) {
  return <RouteMapInner points={points} />
}
