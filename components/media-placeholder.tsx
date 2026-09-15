import { Mountain } from 'lucide-react'

/**
 * One "nothing to show yet" treatment for the whole app, instead of a
 * different one per surface: a route with no media/GPX at all, a photo or
 * video that hasn't arrived yet, and a video that failed to play all read as
 * the same kind of moment, not unrelated states (a spinner here, a broken
 * icon there). `pulse` is the only thing that tells them apart — genuinely
 * empty/failed stays still, still-arriving breathes.
 */
export function MediaPlaceholder({ pulse }: { pulse?: boolean }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-[#c8dae8] ${pulse ? 'animate-pulse' : ''}`}>
      <Mountain size={32} className="text-[#366DA1]/50" />
    </div>
  )
}
