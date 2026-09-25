import type { ReactNode } from 'react'

/**
 * The band of tags under a card's title, shared by the routes and bikes lists.
 *
 * Tags live here and not on the photo: a badge pinned to a corner of the image
 * covers part of the one thing the card is there to show.
 *
 * One line, scrolled by hand. A marquee would make the reader wait for the tag
 * they want to come round again, and would have to be turned off under
 * prefers-reduced-motion anyway. The fade says there is more without moving;
 * pan-x keeps a sideways drag from reading as a tap on the link.
 */
export function CardTagRow({ children }: { children: ReactNode }) {
  return (
    <div className="relative px-4 after:pointer-events-none after:absolute after:inset-y-0 after:right-4 after:w-8 after:bg-gradient-to-l after:from-card after:to-transparent">
      <div className="flex w-full min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}
