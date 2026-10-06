/**
 * The `loader` for `next/image` on photos: it picks the rendition of a photo that
 * fits the width Next asks for.
 *
 * Why it exists: Vercel's image optimizer does not resize an AVIF source — it
 * returns the 2400 px master untouched whatever `w` says (measured on production,
 * also with AVIF among the output formats) — so a 340 px card downloaded 310 KB and
 * the browser shrank it seven times in one step, which leaves jagged edges on thin
 * lines like spokes. The worker therefore makes the smaller sizes itself, next to
 * every master, and this loader chooses among them without going through Vercel at
 * all.
 *
 * The naming is defined in lib/media/keys.ts, which the media worker imports too:
 * `public/…/<uuid>.avif` is the master, and
 * `public/…/<uuid>.w480.avif`, `.w960.avif`, `.w1600.avif` are its renditions. All
 * three always exist for every master (a small master gets same-size copies), so
 * nothing here needs to know the master's own size. Pinned in lib/media/keys.test.ts
 * and in lib/photo-loader.test.ts.
 *
 * Photos from before the worker are JPEG, PNG or WebP, not masters: they go through
 * Next's optimizer as they always did, which resizes them fine.
 */

// The widths live in lib/media/keys.ts, where the worker reads the same list.
import { RENDITION_WIDTHS } from './media/keys'
export { RENDITION_WIDTHS }

const MASTER_PATH = /^\/public\/(?:route-photos|bike-model-photos)\/.+\.avif$/
const IS_RENDITION = /\.w\d+\.avif$/

/** True for a worker master, as opposed to a rendition, a share JPEG or a photo that predates the worker. */
export function isMasterUrl(src: string): boolean {
  let pathname: string
  try {
    pathname = new URL(src, 'http://placeholder.invalid').pathname
  } catch {
    return false
  }
  return MASTER_PATH.test(pathname) && !IS_RENDITION.test(pathname)
}

/** The URL of a master's rendition at `width` — one of RENDITION_WIDTHS. */
export function renditionUrl(masterUrl: string, width: (typeof RENDITION_WIDTHS)[number]): string {
  return masterUrl.replace(/\.avif(?=$|\?)/, `.w${width}.avif`)
}

export function photoLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  if (isMasterUrl(src)) {
    // The smallest rendition that is at least as wide as asked for; past the
    // largest, the master itself (2400 px), which is what a big screen wants.
    const fit = RENDITION_WIDTHS.find((w) => w >= width)
    return fit ? renditionUrl(src, fit) : src
  }
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
}
