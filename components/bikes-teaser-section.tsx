import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SectionViewTracker } from './section-view-tracker'

interface BikesTeaserSectionProps {
  lang: string
  dict: {
    bikes_teaser: {
      title: string
      copy: string
      cta: string
    }
  }
}

/**
 * The invitation to the bikes section, the sibling of the routes teaser — and
 * deliberately not its twin. It sits between the services (white) and the
 * price list (slate-50), so a primary-coloured band is what keeps it from
 * melting into either neighbour or reading as a second routes teaser. The
 * white button on it is the hero's own CTA.
 *
 * The background draws a bike in the same dotted line the routes teaser uses
 * for its trail: two wheels and a diamond frame, in the same tokens as the rest
 * of the homepage.
 *
 * `preserveAspectRatio="xMidYMid meet"`, not the "none" the routes teaser
 * needs: that one is a wavy line that survives being stretched, but stretching
 * two wheels turns them into ellipses. "meet" keeps them round and keeps every
 * coordinate inside the svg's own box, so `tests/browser/geometry.spec.ts` has
 * no overflow to read (the reason the routes teaser avoids "slice").
 *
 * The svg is as tall as the band and as wide as its aspect ratio makes it,
 * centred. On a wide band that is narrower than the band, so the sides stay
 * plain colour; on a phone it is wider than the band and the section's
 * `overflow-hidden` crops it, leaving an arc of each wheel either side of the
 * copy. Fitted to the phone's width instead, the bike shrinks to a pair of
 * ghost circles behind the text. The svg itself is `absolute`, which the
 * geometry test skips, and none of its children leave it.
 *
 * `vector-effect="non-scaling-stroke"` keeps the dots a fixed device-pixel
 * size whatever the scale, as in the routes teaser.
 */
export function BikesTeaserSection({ lang, dict }: BikesTeaserSectionProps) {
  const d = dict.bikes_teaser

  const dotted = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeDasharray: '1 11',
    vectorEffect: 'non-scaling-stroke' as const,
  }

  return (
    <section id="bikes-teaser" className="relative overflow-hidden bg-primary py-20 sm:py-28">
      <SectionViewTracker name="bikes_teaser" />

      <svg
        viewBox="0 0 640 220"
        preserveAspectRatio="xMidYMid meet"
        className="absolute left-1/2 top-1/2 h-full w-auto max-w-none -translate-x-1/2 -translate-y-1/2 text-white/25"
        aria-hidden
      >
        {/* Wheels */}
        <circle cx="170" cy="110" r="68" {...dotted} />
        <circle cx="470" cy="110" r="68" {...dotted} />
        {/* Frame, fainter than the wheels: the copy sits right over it */}
        <g className="text-white/15">
          {/* Chainstay, seat tube, seatstay, top tube, down tube, fork */}
          <path d="M170 110 L285 110 L262 45 Z" {...dotted} />
          <path d="M262 45 L395 42 L285 110" {...dotted} />
          <path d="M395 42 L470 110" {...dotted} />
          {/* Saddle and handlebar */}
          <path d="M248 36 L278 36" {...dotted} />
          <path d="M395 42 L402 26 L420 24" {...dotted} />
        </g>
        {/* Hubs and bottom bracket */}
        {[[170, 110], [470, 110], [285, 110]].map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y} L${x} ${y}`}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-3">
          {d.title}
        </h2>
        <p className="text-primary-foreground/90 max-w-xl mx-auto mb-8 text-balance">
          {d.copy}
        </p>
        <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 font-semibold px-8">
          <Link href={`/${lang}/bikes`}>{d.cta}</Link>
        </Button>
      </div>
    </section>
  )
}
