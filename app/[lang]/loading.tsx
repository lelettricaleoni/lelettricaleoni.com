import { Skeleton } from '@/components/ui/skeleton'

export default function HomeLoading() {
  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <div className="h-16 border-b border-border/40 flex items-center px-6 sm:px-12 gap-8">
        <Skeleton className="h-7 w-28" />
        <div className="hidden md:flex gap-6 ml-auto">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>

      {/* Hero */}
      <div className="relative min-h-[85vh] bg-slate-200 animate-pulse flex flex-col items-center justify-center gap-5 px-6 text-center">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-14 w-48 sm:w-64" />
        <Skeleton className="h-5 w-56 sm:w-80" />
        <div className="flex flex-col sm:flex-row gap-3 mt-4 items-center">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-3 mt-2">
          <Skeleton className="h-11 w-32 rounded-full" />
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </div>

      {/* Services */}
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-20 space-y-10">
        <Skeleton className="h-8 w-44 mx-auto" />
        <div className="grid sm:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border p-6 space-y-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-muted/40 py-20">
        <div className="max-w-5xl mx-auto px-6 sm:px-12 space-y-8">
          <Skeleton className="h-8 w-36 mx-auto" />
          <Skeleton className="h-4 w-72 mx-auto" />
          <div className="rounded-2xl border overflow-hidden bg-white">
            <div className="flex gap-4 px-6 py-3 border-b bg-muted/30">
              {[60, 40, 40, 40, 40].map((w, i) => (
                <Skeleton key={i} className={`h-4 w-${w === 60 ? '1/3' : '16'}`} />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-6 py-3.5 border-b last:border-0">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-14 ml-auto" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map / Info */}
      <div className="max-w-5xl mx-auto px-6 sm:px-12 py-20 space-y-10">
        <Skeleton className="h-8 w-36 mx-auto" />
        <div className="grid lg:grid-cols-2 gap-10">
          <div className="space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-start">
                <Skeleton className="h-5 w-5 rounded-full shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            ))}
            <Skeleton className="h-10 w-36 rounded-lg mt-4" />
          </div>
          <Skeleton className="h-64 lg:h-80 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
