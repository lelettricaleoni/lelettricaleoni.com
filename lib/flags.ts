/**
 * Feature flags.
 *
 * A feature flag is a switch that turns part of the site off without deleting
 * the code. It exists so a section can be taken down in a minute — a service is
 * misbehaving, content is not ready, a page needs to disappear before an event
 * — and put back just as fast, with no code change and nothing to remember to
 * undo.
 *
 * Values come from environment variables, so they are set where the site is
 * deployed and applied on the next deploy. They are read on the server only:
 * a flag never reaches the browser, so switching a feature off removes it from
 * the page rather than hiding it with CSS.
 *
 * Every flag defaults to ON. Unset means "the site works as built", and an
 * unrecognised value means the same — a typo must never take a section down.
 *
 * A note on what "disappears" means for a page. The routes pages have a
 * loading.tsx, so Next streams them, and once the body is streaming the status
 * code can no longer change: `notFound()` renders the not-found UI but the
 * response stays 200. Next covers the SEO side by injecting
 * `<meta name="robots" content="noindex">`, which is why a switched-off section
 * is not indexed despite the 200. Getting a real 404 would mean checking in
 * proxy.ts before the body streams, at the cost of the site's styled 404 page.
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md,
 * section "Status Codes".
 *
 *   FEATURE_ROUTES=off            the whole /routes section disappears
 *   FEATURE_ROUTE_PHOTOS=off      route photo galleries disappear
 *   FEATURE_ROUTE_VIDEOS=off      route videos disappear
 *   FEATURE_ROUTE_FLYOVER=off     the 3D map disappears
 *   FEATURE_ROUTE_GPX_DOWNLOAD=off  GPX downloads stop being offered or served
 */

export const FLAG_DEFAULTS = {
  /** The whole routes section: pages, navbar link, sitemap entries. */
  routes: true,
  /** Photo galleries on route cards and detail pages. */
  routePhotos: true,
  /** Video playback on route detail pages. */
  routeVideos: true,
  /** The Cesium 3D flyover on route detail pages. */
  routeFlyover: true,
  /** The GPX download button and the endpoint that serves the file. */
  routeGpxDownload: true,
} as const

export type FlagName = keyof typeof FLAG_DEFAULTS
export type Flags = Record<FlagName, boolean>

const ENV_NAMES: Record<FlagName, string> = {
  routes: 'FEATURE_ROUTES',
  routePhotos: 'FEATURE_ROUTE_PHOTOS',
  routeVideos: 'FEATURE_ROUTE_VIDEOS',
  routeFlyover: 'FEATURE_ROUTE_FLYOVER',
  routeGpxDownload: 'FEATURE_ROUTE_GPX_DOWNLOAD',
}

/** Everything that lives inside the routes section and dies with it. */
const CHILDREN_OF_ROUTES: FlagName[] = [
  'routePhotos',
  'routeVideos',
  'routeFlyover',
  'routeGpxDownload',
]

const OFF_VALUES = new Set(['off', '0', 'false', 'no'])

function isOff(value: string | undefined): boolean {
  return value !== undefined && OFF_VALUES.has(value.trim().toLowerCase())
}

/**
 * Resolve the flags from a set of environment variables.
 *
 * Exported separately from `getFlags` so it can be tested without touching the
 * real environment.
 */
export function readFlags(env: Record<string, string | undefined>): Flags {
  const flags = {} as Flags
  for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
    flags[name] = !isOff(env[ENV_NAMES[name]])
  }
  // A section cannot be half off: switching off routes switches off what it contains
  if (!flags.routes) {
    for (const child of CHILDREN_OF_ROUTES) flags[child] = false
  }
  return flags
}

/** The flags for this deployment. Server-side only. */
export function getFlags(): Flags {
  return readFlags(process.env as Record<string, string | undefined>)
}
