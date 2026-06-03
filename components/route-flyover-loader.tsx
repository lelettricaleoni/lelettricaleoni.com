'use client'
import dynamic from 'next/dynamic'

const RouteFlyoverInner = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  {
    ssr: false,
    loading: () => <div className="h-72 sm:h-[420px] rounded-xl bg-muted animate-pulse" />,
  }
)

interface Props {
  points: [number, number, number][]
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert'
}

export function RouteFlyoverLoader({ points, difficulty }: Props) {
  return <RouteFlyoverInner points={points} difficulty={difficulty} />
}
