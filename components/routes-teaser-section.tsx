import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SectionViewTracker } from './section-view-tracker'

interface RoutesTeaserSectionProps {
  lang: string
  dict: {
    routes_teaser: {
      title: string
      copy: string
      cta: string
    }
  }
}

/**
 * A calm, static invitation to the routes section — no photos, in the same
 * tokens as the rest of the homepage (bg-slate-50, text-primary/text-foreground,
 * the shadcn Button) rather than the routes pages' own bolder navy palette.
 *
 * The background is a forking trail, the same drawn-line language every
 * route card falls back to when it has no photo or video
 * (`route-card-media.tsx`), not a generic squiggle for texture.
 * `vector-effect="non-scaling-stroke"` keeps the line and
 * the waypoints a fixed device-pixel size no matter how the viewBox ends up
 * scaled to fill the section — without it, stretching a small viewBox this
 * wide blows a dash pattern up into fat blobs.
 *
 * `preserveAspectRatio="none"` rather than the usual `xMidYMid slice`:
 * "slice" covers the box by scaling past it on one axis and relying on the
 * svg element's own viewport to crop the excess — invisible on screen, but
 * `getBoundingClientRect()` on the path reports its full, uncropped
 * geometry, so `tests/browser/geometry.spec.ts` read the intentional
 * overflow as a real one. "none" maps the viewBox onto the box exactly, so
 * no coordinate ever needs to land outside it; a symmetric wavy line
 * doesn't care that the two axes end up scaled unevenly.
 */
export function RoutesTeaserSection({ lang, dict }: RoutesTeaserSectionProps) {
  const d = dict.routes_teaser

  return (
    <section id="routes-teaser" className="relative overflow-hidden bg-slate-50 py-20 sm:py-28">
      <SectionViewTracker name="routes_teaser" />

      <svg
        viewBox="0 0 1200 340"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full text-primary/30"
        aria-hidden
      >
        <path
          d="M0 300 Q 120 260 200 270 Q 320 285 360 220 Q 400 155 480 165"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 11"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M480 165 Q 560 175 610 120 Q 660 65 760 75 Q 860 85 900 40 Q 950 10 1080 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 11"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M480 165 Q 520 220 470 270 Q 420 320 300 330"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 11"
          vectorEffect="non-scaling-stroke"
        />
        {[[200, 270], [900, 40], [300, 330]].map(([x, y]) => (
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
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
          {d.title}
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          {d.copy}
        </p>
        <Button asChild size="lg">
          <Link href={`/${lang}/routes`}>{d.cta}</Link>
        </Button>
      </div>
    </section>
  )
}
