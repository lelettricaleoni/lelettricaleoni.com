'use client'
import dynamic from 'next/dynamic'

const RouteFlyoverInner = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  {
    ssr: false,
    loading: () => <div className="h-72 sm:h-[420px] rounded-xl bg-muted animate-pulse" />,
  }
)

export function RouteFlyoverLoader({ points }: { points: [number, number, number][] }) {
  return <RouteFlyoverInner points={points} />
}
