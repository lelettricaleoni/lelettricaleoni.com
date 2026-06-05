import { Skeleton } from '@/components/ui/skeleton'

export default function RouteDetailLoading() {
  return (
    <main className="w-full pt-24 pb-8">
      <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
        <Skeleton className="h-4 w-28" />

        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>

        <Skeleton className="h-72 sm:h-[420px] w-full rounded-xl" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}
